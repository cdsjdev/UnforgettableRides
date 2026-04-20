const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const navigatorPath = path.join(appRoot, 'src', 'navigation', 'AppNavigator.tsx');
const apiPath = path.join(appRoot, 'src', 'services', 'api.ts');

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
  const api = read(apiPath);

  // Root tabs must reflect the rides app 4-tab structure.
  const requiredRootHeaderSnippets = [
    "name=\"HomeMain\"",
    "name=\"CarsMain\"",
    "name=\"MessagesMain\"",
    "name=\"ProfileMain\"",
  ];
  requiredRootHeaderSnippets.forEach((routeName) => {
    assertIncludes(
      nav,
      routeName,
      `Navigation regression: missing root route ${routeName} in AppNavigator`
    );
  });

  // Ensure legacy pet tabs are not present anymore.
  const legacyRoutes = ["name=\"MyDogsMain\"", "name=\"SocialMain\"", "name=\"ShopMain\"", "name=\"CareMain\""];
  legacyRoutes.forEach((routeName) => {
    if (nav.includes(routeName)) {
      throw new Error(`Navigation regression: legacy route still present: ${routeName}`);
    }
  });

  // Messages tab unread indicator must stay wired.
  assertIncludes(
    nav,
    'unreadCount > 0',
    'Navigation regression: unread indicator logic missing from Messages tab'
  );

  // Unread count should use messaging endpoints.
  assertIncludes(
    api,
    "/social/threads/unread-count",
    'Navigation regression: thread unread endpoint is missing'
  );
  assertIncludes(
    api,
    'unreadCount?: number; unread_count?: number; unread?: number',
    'Navigation regression: unread count compatibility parsing is missing'
  );

  process.stdout.write('PASS: navigation regression guards\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

