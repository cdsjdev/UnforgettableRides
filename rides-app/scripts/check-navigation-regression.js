const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const navigatorPath = path.join(appRoot, 'src', 'navigation', 'AppNavigator.tsx');
const swipeHookPath = path.join(appRoot, 'src', 'utils', 'useRootTabSwipe.ts');
const apiPath = path.join(appRoot, 'src', 'services', 'api.ts');
const aiSettingsPath = path.join(appRoot, 'src', 'screens', 'AISettingsScreen.tsx');
const activityBadgeSettingsPath = path.join(appRoot, 'src', 'utils', 'activityBadgeSettings.ts');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assertIncludes(content, snippet, message) {
  if (!content.includes(snippet)) {
    throw new Error(message);
  }
}

function main() {
  const nav = read(navigatorPath);
  const swipe = read(swipeHookPath);
  const api = read(apiPath);
  const aiSettings = read(aiSettingsPath);
  const activityBadgeSettings = read(activityBadgeSettingsPath);

  // Root tabs must explicitly hide the back button in shared header.
  const requiredRootHeaderSnippets = [
    "name=\"HomeMain\"",
    "name=\"MyDogsMain\"",
    "name=\"SocialMain\"",
    "name=\"ShopMain\"",
    "name=\"CareMain\"",
  ];
  requiredRootHeaderSnippets.forEach((routeName) => {
    assertIncludes(
      nav,
      routeName,
      `Navigation regression: missing root route ${routeName} in AppNavigator`
    );
  });

  const rootBackOverrideMatches = nav.match(/showBackOverride=\{false\}/g) || [];
  if (rootBackOverrideMatches.length < 5) {
    throw new Error(
      `Navigation regression: expected at least 5 root header showBackOverride={false} usages, found ${rootBackOverrideMatches.length}`
    );
  }

  // Root swipe must support nested scroll responder capture and circular wrap.
  assertIncludes(
    swipe,
    'onMoveShouldSetPanResponderCapture',
    'Navigation regression: root swipe capture handler missing'
  );
  assertIncludes(
    swipe,
    'if (targetIndex < 0) targetIndex = routeNames.length - 1;',
    'Navigation regression: missing wrap-around from first tab to last tab'
  );
  assertIncludes(
    swipe,
    'if (targetIndex >= routeNames.length) targetIndex = 0;',
    'Navigation regression: missing wrap-around from last tab to first tab'
  );

  // Root tab activity indicators (red dot) should stay wired for Social/Care/My Dogs.
  assertIncludes(
    nav,
    "'tab-dot-social'",
    'Navigation regression: social tab activity dot test-id is missing'
  );
  assertIncludes(
    nav,
    "'tab-dot-care'",
    'Navigation regression: care tab activity dot test-id is missing'
  );
  assertIncludes(
    nav,
    "'tab-dot-dogs'",
    'Navigation regression: dogs tab activity dot test-id is missing'
  );
  assertIncludes(
    nav,
    'badgeSettings.enabled',
    'Navigation regression: tab activity dots are no longer gated by global badge settings'
  );

  // Social unread count must aggregate notifications + direct-message unread sources.
  assertIncludes(
    api,
    "/social/notifications/unread-count",
    'Navigation regression: social unread notifications endpoint check missing'
  );
  assertIncludes(
    api,
    "/social/unread-count",
    'Navigation regression: social unread message endpoint check missing'
  );
  assertIncludes(
    api,
    'unreadCount: (notificationsUnread ?? 0) + (messagesUnread ?? 0)',
    'Navigation regression: social unread aggregation logic missing'
  );

  assertIncludes(
    aiSettings,
    'profile.showActivityBadges',
    'Navigation regression: Show activity badges toggle missing from Settings screen'
  );
  assertIncludes(
    aiSettings,
    'handleSaveNotifications',
    'Navigation regression: notification settings save handler missing from Settings screen'
  );
  assertIncludes(
    activityBadgeSettings,
    'DEFAULT_ACTIVITY_BADGE_SETTINGS',
    'Navigation regression: activity badge settings default schema missing'
  );
  assertIncludes(
    activityBadgeSettings,
    "ACTIVITY_BADGE_SETTINGS_KEY = '@rides_activity_badge_settings'",
    'Navigation regression: activity badge settings storage key missing'
  );

  process.stdout.write('PASS: navigation regression guards\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

