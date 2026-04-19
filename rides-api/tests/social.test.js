const { app, db, request, createTestUser } = require('./helpers');

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function makeMutualFollow(userA, userB) {
  const followAB = await request(app)
    .post(`/api/v1/social/follows/${userB.user.id}`)
    .set(auth(userA.token))
    .send({});
  expect([200, 201]).toContain(followAB.status);

  const followBA = await request(app)
    .post(`/api/v1/social/follows/${userA.user.id}`)
    .set(auth(userB.token))
    .send({});
  expect([200, 201]).toContain(followBA.status);
}

function cleanupSocialForEmailLike(prefix) {
  const like = `${prefix}%`;
  db.prepare(`
    DELETE FROM social_meetup_reports
    WHERE reporter_user_id IN (SELECT id FROM users WHERE email LIKE ?)
       OR meetup_id IN (
         SELECT id FROM social_meetups
         WHERE host_user_id IN (SELECT id FROM users WHERE email LIKE ?)
       )
  `).run(like, like);
  db.prepare(`
    DELETE FROM social_meetup_attendees
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE ?)
       OR meetup_id IN (
         SELECT id FROM social_meetups
         WHERE host_user_id IN (SELECT id FROM users WHERE email LIKE ?)
       )
  `).run(like, like);
  db.prepare(`
    DELETE FROM social_meetups
    WHERE host_user_id IN (SELECT id FROM users WHERE email LIKE ?)
  `).run(like);
  db.prepare(`
    DELETE FROM social_messages
    WHERE sender_user_id IN (SELECT id FROM users WHERE email LIKE ?)
       OR thread_id IN (
         SELECT thread_id
         FROM social_thread_members
         WHERE user_id IN (SELECT id FROM users WHERE email LIKE ?)
       )
  `).run(like, like);
  db.prepare(`
    DELETE FROM social_thread_members
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE ?)
       OR thread_id IN (
         SELECT id
         FROM social_threads
         WHERE created_by IN (SELECT id FROM users WHERE email LIKE ?)
       )
  `).run(like, like);
  db.prepare('DELETE FROM social_threads WHERE created_by IN (SELECT id FROM users WHERE email LIKE ?)').run(like);
  db.prepare(`
    DELETE FROM social_follows
    WHERE follower_user_id IN (SELECT id FROM users WHERE email LIKE ?)
       OR followed_user_id IN (SELECT id FROM users WHERE email LIKE ?)
  `).run(like, like);
  db.prepare(`
    DELETE FROM social_blocks
    WHERE blocker_user_id IN (SELECT id FROM users WHERE email LIKE ?)
       OR blocked_user_id IN (SELECT id FROM users WHERE email LIKE ?)
  `).run(like, like);
  db.prepare(`
    DELETE FROM social_reports
    WHERE reporter_user_id IN (SELECT id FROM users WHERE email LIKE ?)
  `).run(like);
  db.prepare(`
    DELETE FROM social_users
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE ?)
  `).run(like);
  db.prepare("DELETE FROM users WHERE email LIKE ?").run(like);
}

describe('Social API integration', () => {
  const prefix = `social-${Date.now()}-`;
  const originalSocialEnabled = process.env.SOCIAL_ENABLED;
  const defaultSocialEnabled = originalSocialEnabled ?? 'true';

  afterAll(() => {
    process.env.SOCIAL_ENABLED = defaultSocialEnabled;
    cleanupSocialForEmailLike(prefix);
  });

  test('SOCIAL_ENABLED=false returns FEATURE_DISABLED', async () => {
    const user = createTestUser('customer', { email: `${prefix}flagoff@petcare.test` });
    process.env.SOCIAL_ENABLED = 'false';
    try {
      const res = await request(app)
        .get('/api/v1/social/_meta')
        .set(auth(user.token));
      expect(res.status).toBe(403);
      expect(res.body?.error?.code).toBe('FEATURE_DISABLED');
    } finally {
      process.env.SOCIAL_ENABLED = defaultSocialEnabled;
    }
  });

  test('social endpoints require auth', async () => {
    const res = await request(app).get('/api/v1/social/unread-count');
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('UNAUTHORIZED');
  });

  test('non-member cannot read thread messages', async () => {
    const a = createTestUser('customer', { email: `${prefix}member-a@petcare.test` });
    const b = createTestUser('customer', { email: `${prefix}member-b@petcare.test` });
    const outsider = createTestUser('customer', { email: `${prefix}outsider@petcare.test` });
    await makeMutualFollow(a, b);

    const createRes = await request(app)
      .post('/api/v1/social/threads/direct')
      .set(auth(a.token))
      .send({ other_user_id: b.user.id });
    expect([200, 201]).toContain(createRes.status);
    const threadId = createRes.body?.data?.threadId;
    expect(threadId).toBeTruthy();

    const readRes = await request(app)
      .get(`/api/v1/social/threads/${threadId}/messages`)
      .set(auth(outsider.token));
    expect(readRes.status).toBe(403);
    expect(readRes.body?.error?.code).toBe('FORBIDDEN');
  });

  test('blocked users cannot send messages (both directions)', async () => {
    const a = createTestUser('customer', { email: `${prefix}block-a@petcare.test` });
    const b = createTestUser('customer', { email: `${prefix}block-b@petcare.test` });
    await makeMutualFollow(a, b);

    const createRes = await request(app)
      .post('/api/v1/social/threads/direct')
      .set(auth(a.token))
      .send({ other_user_id: b.user.id });
    const threadId = createRes.body?.data?.threadId;

    const blockRes = await request(app)
      .post(`/api/v1/social/blocks/${b.user.id}`)
      .set(auth(a.token))
      .send({});
    expect(blockRes.status).toBe(201);

    const sendFromA = await request(app)
      .post(`/api/v1/social/threads/${threadId}/messages`)
      .set(auth(a.token))
      .send({ body: 'hello from a' });
    expect(sendFromA.status).toBe(403);

    const sendFromB = await request(app)
      .post(`/api/v1/social/threads/${threadId}/messages`)
      .set(auth(b.token))
      .send({ body: 'hello from b' });
    expect(sendFromB.status).toBe(403);
  });

  test('message_privacy=nobody blocks new direct thread creation', async () => {
    const owner = createTestUser('customer', { email: `${prefix}privacy-owner@petcare.test` });
    const other = createTestUser('customer', { email: `${prefix}privacy-other@petcare.test` });
    await makeMutualFollow(owner, other);

    const settingsRes = await request(app)
      .put('/api/v1/social/me/settings')
      .set(auth(owner.token))
      .send({ message_privacy: 'nobody' });
    expect(settingsRes.status).toBe(200);

    const createRes = await request(app)
      .post('/api/v1/social/threads/direct')
      .set(auth(other.token))
      .send({ other_user_id: owner.user.id });
    expect(createRes.status).toBe(403);
    expect(createRes.body?.error?.code).toBe('FORBIDDEN');
  });

  test('message_privacy=nobody does not break existing thread messaging', async () => {
    const owner = createTestUser('customer', { email: `${prefix}existing-owner@petcare.test` });
    const other = createTestUser('customer', { email: `${prefix}existing-other@petcare.test` });
    await makeMutualFollow(owner, other);

    const createRes = await request(app)
      .post('/api/v1/social/threads/direct')
      .set(auth(other.token))
      .send({ other_user_id: owner.user.id });
    expect([200, 201]).toContain(createRes.status);
    const threadId = createRes.body?.data?.threadId;

    const settingsRes = await request(app)
      .put('/api/v1/social/me/settings')
      .set(auth(owner.token))
      .send({ message_privacy: 'nobody' });
    expect(settingsRes.status).toBe(200);

    const sendRes = await request(app)
      .post(`/api/v1/social/threads/${threadId}/messages`)
      .set(auth(other.token))
      .send({ body: 'still allowed in existing thread' });
    expect(sendRes.status).toBe(201);
  });

  test('direct thread creation requires mutual follow', async () => {
    const a = createTestUser('customer', { email: `${prefix}mutual-create-a@petcare.test` });
    const b = createTestUser('customer', { email: `${prefix}mutual-create-b@petcare.test` });

    const createRes = await request(app)
      .post('/api/v1/social/threads/direct')
      .set(auth(a.token))
      .send({ other_user_id: b.user.id });
    expect(createRes.status).toBe(403);
    expect(createRes.body?.error?.code).toBe('FORBIDDEN');
    expect(String(createRes.body?.error?.message || '').toLowerCase()).toContain('mutual follow');
  });

  test('existing direct thread send is blocked after mutual follow is removed', async () => {
    const a = createTestUser('customer', { email: `${prefix}mutual-send-a@petcare.test` });
    const b = createTestUser('customer', { email: `${prefix}mutual-send-b@petcare.test` });
    await makeMutualFollow(a, b);

    const createRes = await request(app)
      .post('/api/v1/social/threads/direct')
      .set(auth(a.token))
      .send({ other_user_id: b.user.id });
    expect([200, 201]).toContain(createRes.status);
    const threadId = createRes.body?.data?.threadId;
    expect(threadId).toBeTruthy();

    const unfollowRes = await request(app)
      .delete(`/api/v1/social/follows/${b.user.id}`)
      .set(auth(a.token));
    expect(unfollowRes.status).toBe(200);

    const sendFromA = await request(app)
      .post(`/api/v1/social/threads/${threadId}/messages`)
      .set(auth(a.token))
      .send({ body: 'should fail after unfollow' });
    expect(sendFromA.status).toBe(403);
    expect(sendFromA.body?.error?.code).toBe('FORBIDDEN');
  });

  test('client_msg_id is idempotent within a thread per sender', async () => {
    const a = createTestUser('customer', { email: `${prefix}idemp-a@petcare.test` });
    const b = createTestUser('customer', { email: `${prefix}idemp-b@petcare.test` });
    await makeMutualFollow(a, b);
    const createRes = await request(app)
      .post('/api/v1/social/threads/direct')
      .set(auth(a.token))
      .send({ other_user_id: b.user.id });
    const threadId = createRes.body?.data?.threadId;
    const clientMsgId = `cmid-${Date.now()}`;

    const first = await request(app)
      .post(`/api/v1/social/threads/${threadId}/messages`)
      .set(auth(a.token))
      .send({ body: 'first send', clientMsgId });
    expect(first.status).toBe(201);
    const firstId = first.body?.data?.id;

    const second = await request(app)
      .post(`/api/v1/social/threads/${threadId}/messages`)
      .set(auth(a.token))
      .send({ body: 'first send', clientMsgId });
    expect(second.status).toBe(200);
    expect(second.body?.data?.id).toBe(firstId);
  });

  test('thread messages pagination has no duplicate ids across pages', async () => {
    const a = createTestUser('customer', { email: `${prefix}page-a@petcare.test` });
    const b = createTestUser('customer', { email: `${prefix}page-b@petcare.test` });
    await makeMutualFollow(a, b);
    const createRes = await request(app)
      .post('/api/v1/social/threads/direct')
      .set(auth(a.token))
      .send({ other_user_id: b.user.id });
    const threadId = createRes.body?.data?.threadId;

    for (let i = 0; i < 8; i += 1) {
      const sendRes = await request(app)
        .post(`/api/v1/social/threads/${threadId}/messages`)
        .set(auth(a.token))
        .send({ body: `msg ${i}`, clientMsgId: `p-${i}-${Date.now()}` });
      expect(sendRes.status).toBe(201);
    }

    const p1 = await request(app)
      .get(`/api/v1/social/threads/${threadId}/messages`)
      .set(auth(a.token))
      .query({ limit: 3 });
    expect(p1.status).toBe(200);
    const ids1 = (p1.body?.data?.items || []).map((m) => m.id);
    const cursor = p1.body?.data?.nextCursor;
    expect(ids1.length).toBe(3);
    expect(cursor).toBeTruthy();

    const p2 = await request(app)
      .get(`/api/v1/social/threads/${threadId}/messages`)
      .set(auth(a.token))
      .query({ limit: 3, cursor });
    expect(p2.status).toBe(200);
    const ids2 = (p2.body?.data?.items || []).map((m) => m.id);
    const union = new Set([...ids1, ...ids2]);
    expect(union.size).toBe(ids1.length + ids2.length);
  });

  test('social profile response omits email and phone', async () => {
    const viewer = createTestUser('customer', { email: `${prefix}viewer@petcare.test` });
    const target = createTestUser('customer', {
      email: `${prefix}target@petcare.test`,
      name: 'Target Profile User',
    });

    const res = await request(app)
      .get(`/api/v1/social/users/${target.user.id}/profile`)
      .set(auth(viewer.token));
    expect(res.status).toBe(200);
    expect(res.body?.data?.userId).toBe(target.user.id);
    expect(res.body?.data?.displayName).toBe('Target Profile User');
    expect(res.body?.data?.email).toBeUndefined();
    expect(res.body?.data?.phone).toBeUndefined();
    expect(res.body?.data?.phone_number).toBeUndefined();
  });

  test('follow requests can be accepted and rejected', async () => {
    const owner = createTestUser('customer', { email: `${prefix}owner@petcare.test` });
    const requester = createTestUser('customer', { email: `${prefix}requester@petcare.test` });

    await request(app)
      .put('/api/v1/social/me/settings')
      .set(auth(owner.token))
      .send({ profile_visibility: 'private' });

    const followReq = await request(app)
      .post(`/api/v1/social/follows/${owner.user.id}`)
      .set(auth(requester.token))
      .send({});
    expect(followReq.status).toBe(201);
    expect(followReq.body?.data?.status).toBe('requested');

    const listRes = await request(app)
      .get('/api/v1/social/me/follow-requests')
      .set(auth(owner.token));
    expect(listRes.status).toBe(200);
    expect((listRes.body?.data?.items || []).some((x) => x.userId === requester.user.id)).toBe(true);

    const acceptRes = await request(app)
      .post(`/api/v1/social/follows/${requester.user.id}/accept`)
      .set(auth(owner.token))
      .send({});
    expect(acceptRes.status).toBe(200);

    const againRes = await request(app)
      .post(`/api/v1/social/follows/${owner.user.id}`)
      .set(auth(requester.token))
      .send({});
    expect(againRes.status).toBe(201);
    expect(againRes.body?.data?.status).toBe('requested');

    const rejectRes = await request(app)
      .delete(`/api/v1/social/follows/${requester.user.id}/reject`)
      .set(auth(owner.token));
    expect(rejectRes.status).toBe(200);
  });

  test('suggested contacts uses smart ranking and respects limit', async () => {
    const viewer = createTestUser('customer', { email: `${prefix}suggest-viewer@petcare.test`, name: 'Suggest Viewer' });
    const followsYou = createTestUser('customer', { email: `${prefix}suggest-follows-you@petcare.test`, name: 'Follows You' });
    const mutualStrong = createTestUser('customer', { email: `${prefix}suggest-mutual-strong@petcare.test`, name: 'Mutual Strong' });
    const activePoster = createTestUser('customer', { email: `${prefix}suggest-active-poster@petcare.test`, name: 'Active Poster' });
    const bridgeA = createTestUser('customer', { email: `${prefix}suggest-bridge-a@petcare.test`, name: 'Bridge A' });
    const bridgeB = createTestUser('customer', { email: `${prefix}suggest-bridge-b@petcare.test`, name: 'Bridge B' });

    // Candidate 1: follows viewer directly ("follows_you" signal).
    const directSignal = await request(app)
      .post(`/api/v1/social/follows/${viewer.user.id}`)
      .set(auth(followsYou.token))
      .send({});
    expect([200, 201]).toContain(directSignal.status);

    // Candidate 2: strong mutual network via users viewer already follows.
    for (const bridge of [bridgeA, bridgeB]) {
      const viewerFollowBridge = await request(app)
        .post(`/api/v1/social/follows/${bridge.user.id}`)
        .set(auth(viewer.token))
        .send({});
      expect([200, 201]).toContain(viewerFollowBridge.status);

      const bridgeFollowMutual = await request(app)
        .post(`/api/v1/social/follows/${mutualStrong.user.id}`)
        .set(auth(bridge.token))
        .send({});
      expect([200, 201]).toContain(bridgeFollowMutual.status);
    }

    // Candidate 3: weaker (but still positive) mutual signal.
    const bridgeFollowActivePoster = await request(app)
      .post(`/api/v1/social/follows/${activePoster.user.id}`)
      .set(auth(bridgeA.token))
      .send({});
    expect([200, 201]).toContain(bridgeFollowActivePoster.status);

    const suggestedRes = await request(app)
      .get('/api/v1/social/me/suggested-contacts')
      .set(auth(viewer.token))
      .query({ limit: 3 });
    expect(suggestedRes.status).toBe(200);
    const items = suggestedRes.body?.data?.items || [];
    expect(items.length).toBeLessThanOrEqual(3);
    const ids = items.map((x) => x.userId);

    expect(ids[0]).toBe(followsYou.user.id);
    expect(ids[1]).toBe(mutualStrong.user.id);
    expect(ids).toContain(activePoster.user.id);
  });

  test('suspended user cannot send messages', async () => {
    const suspendedUser = createTestUser('customer', { email: `${prefix}suspend-a@petcare.test` });
    const peer = createTestUser('customer', { email: `${prefix}suspend-b@petcare.test` });
    await makeMutualFollow(suspendedUser, peer);

    const createRes = await request(app)
      .post('/api/v1/social/threads/direct')
      .set(auth(suspendedUser.token))
      .send({ other_user_id: peer.user.id });
    expect([200, 201]).toContain(createRes.status);
    const threadId = createRes.body?.data?.threadId;

    // Ensure social row exists, then suspend for 24h.
    await request(app).get('/api/v1/social/_meta').set(auth(suspendedUser.token));
    db.prepare(`
      UPDATE social_users
      SET suspended_until = datetime('now', '+1 day')
      WHERE user_id = ?
    `).run(suspendedUser.user.id);

    const sendRes = await request(app)
      .post(`/api/v1/social/threads/${threadId}/messages`)
      .set(auth(suspendedUser.token))
      .send({ body: 'this should be blocked' });
    expect(sendRes.status).toBe(403);
    expect(sendRes.body?.error?.code).toBe('FORBIDDEN');
  });

  test('leaving a thread removes it from inbox', async () => {
    const a = createTestUser('customer', { email: `${prefix}leave-a@petcare.test` });
    const b = createTestUser('customer', { email: `${prefix}leave-b@petcare.test` });
    await makeMutualFollow(a, b);

    const createRes = await request(app)
      .post('/api/v1/social/threads/direct')
      .set(auth(a.token))
      .send({ other_user_id: b.user.id });
    expect([200, 201]).toContain(createRes.status);
    const threadId = createRes.body?.data?.threadId;
    expect(threadId).toBeTruthy();

    const beforeRes = await request(app)
      .get('/api/v1/social/threads')
      .set(auth(a.token));
    expect(beforeRes.status).toBe(200);
    expect((beforeRes.body?.data?.items || []).some((x) => x.id === threadId)).toBe(true);

    const leaveRes = await request(app)
      .delete(`/api/v1/social/threads/${threadId}/members/me`)
      .set(auth(a.token));
    expect(leaveRes.status).toBe(200);

    const afterRes = await request(app)
      .get('/api/v1/social/threads')
      .set(auth(a.token));
    expect(afterRes.status).toBe(200);
    expect((afterRes.body?.data?.items || []).some((x) => x.id === threadId)).toBe(false);
  });

  test('duplicate message content is blocked as spam', async () => {
    const a = createTestUser('customer', { email: `${prefix}spam-msg-a@petcare.test` });
    const b = createTestUser('customer', { email: `${prefix}spam-msg-b@petcare.test` });
    await makeMutualFollow(a, b);

    const createRes = await request(app)
      .post('/api/v1/social/threads/direct')
      .set(auth(a.token))
      .send({ other_user_id: b.user.id });
    expect([200, 201]).toContain(createRes.status);
    const threadId = createRes.body?.data?.threadId;

    const payload = { body: 'same repeated message for spam test' };
    const first = await request(app)
      .post(`/api/v1/social/threads/${threadId}/messages`)
      .set(auth(a.token))
      .send(payload);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/v1/social/threads/${threadId}/messages`)
      .set(auth(a.token))
      .send(payload);
    expect(second.status).toBe(201);

    const third = await request(app)
      .post(`/api/v1/social/threads/${threadId}/messages`)
      .set(auth(a.token))
      .send(payload);
    expect(third.status).toBe(429);
    expect(third.body?.error?.code).toBe('SPAM_DETECTED');
  });

  test('follow/unfollow churn is throttled for the same user pair', async () => {
    const a = createTestUser('customer', { email: `${prefix}churn-a@petcare.test` });
    const b = createTestUser('customer', { email: `${prefix}churn-b@petcare.test` });

    for (let i = 0; i < 4; i += 1) {
      const followRes = await request(app)
        .post(`/api/v1/social/follows/${b.user.id}`)
        .set(auth(a.token))
        .send({});
      expect(followRes.status).toBe(201);

      const unfollowRes = await request(app)
        .delete(`/api/v1/social/follows/${b.user.id}`)
        .set(auth(a.token));
      expect(unfollowRes.status).toBe(200);
    }

    const blockedRes = await request(app)
      .post(`/api/v1/social/follows/${b.user.id}`)
      .set(auth(a.token))
      .send({});
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body?.error?.code).toBe('SPAM_DETECTED');
  });

  test('report submissions are rate limited per user', async () => {
    const reporter = createTestUser('customer', { email: `${prefix}rl-reporter@petcare.test` });

    for (let i = 0; i < 10; i += 1) {
      const targetUser = createTestUser('customer', { email: `${prefix}rl-target-${i}@petcare.test` });
      const res = await request(app)
        .post('/api/v1/social/reports')
        .set(auth(reporter.token))
        .send({
          target_type: 'user',
          target_id: targetUser.user.id,
          reason_code: 'abuse',
        });
      expect(res.status).toBe(201);
    }

    const limited = await request(app)
      .post('/api/v1/social/reports')
      .set(auth(reporter.token))
      .send({
        target_type: 'user',
        target_id: createTestUser('customer', { email: `${prefix}rl-target-over-limit@petcare.test` }).user.id,
        reason_code: 'abuse',
      });
    expect(limited.status).toBe(429);
    expect(limited.body?.error?.code).toBe('RATE_LIMITED');
  });

  test('post is auto-flagged after repeated reports and restored after admin review', async () => {
    const admin = createTestUser('admin', { email: `${prefix}flag-admin@petcare.test` });
    const author = createTestUser('customer', { email: `${prefix}flag-author@petcare.test` });
    const r1 = createTestUser('customer', { email: `${prefix}flag-r1@petcare.test` });
    const r2 = createTestUser('customer', { email: `${prefix}flag-r2@petcare.test` });
    const r3 = createTestUser('customer', { email: `${prefix}flag-r3@petcare.test` });

    const createRes = await request(app)
      .post('/api/v1/social/posts')
      .set(auth(author.token))
      .send({
        content: 'Flag lifecycle test post',
        visibility: 'public',
      });
    expect(createRes.status).toBe(201);
    const postId = createRes.body?.data?.id;
    expect(postId).toBeTruthy();

    for (const reporter of [r1, r2, r3]) {
      const reportRes = await request(app)
        .post('/api/v1/social/reports')
        .set(auth(reporter.token))
        .send({
          target_type: 'post',
          target_id: postId,
          reason_code: 'abuse',
        });
      expect(reportRes.status).toBe(201);
    }

    const flaggedRow = db.prepare(`
      SELECT flagged_at, flagged_reason_code, flagged_report_count
      FROM social_posts
      WHERE id = ?
      LIMIT 1
    `).get(postId);
    expect(flaggedRow?.flagged_at).toBeTruthy();
    expect(flaggedRow?.flagged_reason_code).toBe('auto_report_threshold');
    expect(Number(flaggedRow?.flagged_report_count || 0)).toBeGreaterThanOrEqual(3);

    const hiddenFromFeed = await request(app)
      .get('/api/v1/social/feed')
      .set(auth(author.token));
    expect(hiddenFromFeed.status).toBe(200);
    expect((hiddenFromFeed.body?.data?.items || []).some((x) => x.id === postId)).toBe(false);

    const hiddenFromDetail = await request(app)
      .get(`/api/v1/social/posts/${postId}`)
      .set(auth(author.token));
    expect(hiddenFromDetail.status).toBe(404);

    const reportRows = db.prepare(`
      SELECT id
      FROM social_reports
      WHERE target_type = 'post' AND target_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(postId);
    expect(reportRows.length).toBe(3);

    for (const row of reportRows) {
      const resolveRes = await request(app)
        .post(`/api/v1/social/admin/reports/${row.id}/resolve`)
        .set(auth(admin.token))
        .send({ status: 'reviewed' });
      expect(resolveRes.status).toBe(200);
    }

    const unflaggedRow = db.prepare(`
      SELECT flagged_at, flagged_reason_code
      FROM social_posts
      WHERE id = ?
      LIMIT 1
    `).get(postId);
    expect(unflaggedRow?.flagged_at).toBeNull();
    expect(unflaggedRow?.flagged_reason_code).toBeNull();

    const visibleAgain = await request(app)
      .get(`/api/v1/social/posts/${postId}`)
      .set(auth(author.token));
    expect(visibleAgain.status).toBe(200);
  });

  test('comment is auto-flagged after repeated reports and restored after admin review', async () => {
    const admin = createTestUser('admin', { email: `${prefix}flag-comment-admin@petcare.test` });
    const author = createTestUser('customer', { email: `${prefix}flag-comment-author@petcare.test` });
    const commenter = createTestUser('customer', { email: `${prefix}flag-comment-commenter@petcare.test` });
    const r1 = createTestUser('customer', { email: `${prefix}flag-comment-r1@petcare.test` });
    const r2 = createTestUser('customer', { email: `${prefix}flag-comment-r2@petcare.test` });
    const r3 = createTestUser('customer', { email: `${prefix}flag-comment-r3@petcare.test` });

    const createRes = await request(app)
      .post('/api/v1/social/posts')
      .set(auth(author.token))
      .send({
        content: 'Comment flag lifecycle host post',
        visibility: 'public',
      });
    expect(createRes.status).toBe(201);
    const postId = createRes.body?.data?.id;

    const followRes = await request(app)
      .post(`/api/v1/social/follows/${author.user.id}`)
      .set(auth(commenter.token))
      .send({});
    expect(followRes.status).toBe(201);

    const commentRes = await request(app)
      .post(`/api/v1/social/posts/${postId}/comments`)
      .set(auth(commenter.token))
      .send({ content: 'Comment that will be reported' });
    expect(commentRes.status).toBe(201);
    const commentId = commentRes.body?.data?.id;
    expect(commentId).toBeTruthy();

    for (const reporter of [r1, r2, r3]) {
      const reportRes = await request(app)
        .post('/api/v1/social/reports')
        .set(auth(reporter.token))
        .send({
          target_type: 'comment',
          target_id: commentId,
          reason_code: 'abuse',
        });
      expect(reportRes.status).toBe(201);
    }

    const hiddenComments = await request(app)
      .get(`/api/v1/social/posts/${postId}/comments`)
      .set(auth(author.token));
    expect(hiddenComments.status).toBe(200);
    expect((hiddenComments.body?.data?.items || []).some((x) => x.id === commentId)).toBe(false);

    const reportRows = db.prepare(`
      SELECT id
      FROM social_reports
      WHERE target_type = 'comment' AND target_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(commentId);
    expect(reportRows.length).toBe(3);

    for (const row of reportRows) {
      const resolveRes = await request(app)
        .post(`/api/v1/social/admin/reports/${row.id}/resolve`)
        .set(auth(admin.token))
        .send({ status: 'reviewed' });
      expect(resolveRes.status).toBe(200);
    }

    const visibleComments = await request(app)
      .get(`/api/v1/social/posts/${postId}/comments`)
      .set(auth(author.token));
    expect(visibleComments.status).toBe(200);
    expect((visibleComments.body?.data?.items || []).some((x) => x.id === commentId)).toBe(true);
  });

  test('abuse stats endpoint requires admin role', async () => {
    const customer = createTestUser('customer', { email: `${prefix}abuse-nonadmin@petcare.test` });
    const res = await request(app)
      .get('/api/v1/social/admin/abuse-stats')
      .set(auth(customer.token));
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('admin can read abuse stats with expected shape', async () => {
    const admin = createTestUser('admin', { email: `${prefix}abuse-admin@petcare.test` });
    const reporter = createTestUser('customer', { email: `${prefix}abuse-reporter@petcare.test` });

    // Generate a deterministic RATE_LIMITED signal for this test user.
    for (let i = 0; i < 10; i += 1) {
      const targetUser = createTestUser('customer', { email: `${prefix}abuse-target-${i}@petcare.test` });
      const res = await request(app)
        .post('/api/v1/social/reports')
        .set(auth(reporter.token))
        .send({
          target_type: 'user',
          target_id: targetUser.user.id,
          reason_code: 'abuse',
        });
      expect(res.status).toBe(201);
    }
    const limited = await request(app)
      .post('/api/v1/social/reports')
      .set(auth(reporter.token))
      .send({
        target_type: 'user',
        target_id: createTestUser('customer', { email: `${prefix}abuse-target-over-limit@petcare.test` }).user.id,
        reason_code: 'abuse',
      });
    expect(limited.status).toBe(429);
    expect(limited.body?.error?.code).toBe('RATE_LIMITED');

    const statsRes = await request(app)
      .get('/api/v1/social/admin/abuse-stats')
      .query({ hours: 24, recent_limit: 20, max_rows: 500 })
      .set(auth(admin.token));
    expect(statsRes.status).toBe(200);

    const data = statsRes.body?.data;
    expect(data).toBeTruthy();
    expect(data.windowHours).toBe(24);
    expect(typeof data.sampledRows).toBe('number');
    expect(typeof data.totals?.inWindow).toBe('number');
    expect(typeof data.totals?.processLifetime).toBe('number');
    expect(Array.isArray(data.breakdown?.byCode)).toBe(true);
    expect(Array.isArray(data.breakdown?.byAction)).toBe(true);
    expect(Array.isArray(data.breakdown?.byRoute)).toBe(true);
    expect(Array.isArray(data.breakdown?.topUsers)).toBe(true);
    expect(Array.isArray(data.rawSignals?.rateLimitEventsByKey)).toBe(true);
    expect(Array.isArray(data.rawSignals?.contentFingerprintsByKey)).toBe(true);
    expect(Array.isArray(data.recentEvents)).toBe(true);
    expect(typeof data.alerting?.windowMs).toBe('number');
    expect(typeof data.alerting?.cooldownMs).toBe('number');
    expect(data.alerting?.thresholds?.total).toBe(25);
    expect(data.alerting?.thresholds?.rateLimited).toBe(15);
    expect(data.alerting?.thresholds?.spamDetected).toBe(10);
    expect(typeof data.alerting?.currentWindow?.total).toBe('number');
    expect(typeof data.alerting?.currentWindow?.rateLimited).toBe('number');
    expect(typeof data.alerting?.currentWindow?.spamDetected).toBe('number');

    const hasRateLimited = (data.breakdown.byCode || []).some((row) => row.key === 'RATE_LIMITED' && row.count >= 1);
    expect(hasRateLimited).toBe(true);
    expect(Number(data.alerting?.currentWindow?.rateLimited || 0)).toBeGreaterThanOrEqual(1);
  });

  test('meetups can be created, listed, and fetched from my meetups', async () => {
    const host = createTestUser('customer', { email: `${prefix}meetup-host@petcare.test` });
    const viewer = createTestUser('customer', { email: `${prefix}meetup-viewer@petcare.test` });

    const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + 90 * 60 * 1000);
    const createRes = await request(app)
      .post('/api/v1/social/meetups')
      .set(auth(host.token))
      .send({
        title: 'Saturday Dog Walk',
        description: 'Bring water and treats',
        locationName: 'Riverfront Park',
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        capacity: 12,
        visibility: 'public',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body?.data?.title).toBe('Saturday Dog Walk');
    expect(createRes.body?.data?.locationName).toBe('Riverfront Park');

    const meetupId = createRes.body?.data?.id;
    expect(meetupId).toBeTruthy();

    const listRes = await request(app)
      .get('/api/v1/social/meetups')
      .set(auth(viewer.token))
      .query({ query: 'riverfront' });
    expect(listRes.status).toBe(200);
    expect((listRes.body?.data?.items || []).some((m) => m.id === meetupId)).toBe(true);

    const detailRes = await request(app)
      .get(`/api/v1/social/meetups/${meetupId}`)
      .set(auth(viewer.token));
    expect(detailRes.status).toBe(200);
    expect(detailRes.body?.data?.attendeeCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(detailRes.body?.data?.attendees)).toBe(true);

    const mineRes = await request(app)
      .get('/api/v1/social/meetups/me')
      .set(auth(host.token));
    expect(mineRes.status).toBe(200);
    expect((mineRes.body?.data?.items || []).some((m) => m.id === meetupId)).toBe(true);
  });

  test('private meetup join request can be approved by host', async () => {
    const host = createTestUser('customer', { email: `${prefix}meetup-private-host@petcare.test` });
    const requester = createTestUser('customer', { email: `${prefix}meetup-private-requester@petcare.test` });

    const startAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    const createRes = await request(app)
      .post('/api/v1/social/meetups')
      .set(auth(host.token))
      .send({
        title: 'Private Training Circle',
        locationText: 'Training Yard',
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        visibility: 'private',
      });
    expect(createRes.status).toBe(201);
    const meetupId = createRes.body?.data?.id;
    expect(meetupId).toBeTruthy();

    const joinRes = await request(app)
      .post(`/api/v1/social/meetups/${meetupId}/join`)
      .set(auth(requester.token))
      .send({});
    expect(joinRes.status).toBe(200);
    expect(joinRes.body?.data?.status).toBe('requested');

    const hostDetailBefore = await request(app)
      .get(`/api/v1/social/meetups/${meetupId}`)
      .set(auth(host.token));
    expect(hostDetailBefore.status).toBe(200);
    expect(Array.isArray(hostDetailBefore.body?.data?.pendingRequests)).toBe(true);
    expect((hostDetailBefore.body?.data?.pendingRequests || []).some((a) => a.userId === requester.user.id)).toBe(true);

    const approveRes = await request(app)
      .post(`/api/v1/social/meetups/${meetupId}/requests/${requester.user.id}/approve`)
      .set(auth(host.token))
      .send({});
    expect(approveRes.status).toBe(200);
    expect(approveRes.body?.data?.success).toBe(true);

    const requesterDetail = await request(app)
      .get(`/api/v1/social/meetups/${meetupId}`)
      .set(auth(requester.token));
    expect(requesterDetail.status).toBe(200);
    expect(requesterDetail.body?.data?.myAttendanceStatus).toBe('going');
    expect(requesterDetail.body?.data?.joinedByMe).toBe(true);
  });
});
