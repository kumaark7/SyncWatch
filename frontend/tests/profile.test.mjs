import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const requireFromHere = createRequire(import.meta.url);
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const profileSource = readFileSync(
  new URL("../src/auth/ProfilePage.tsx", import.meta.url),
  "utf8"
);
const accountMenuSource = readFileSync(
  new URL("../src/auth/HomeAccountMenu.tsx", import.meta.url),
  "utf8"
);
const driveSource = readFileSync(
  new URL("../src/googleDriveConnection.ts", import.meta.url),
  "utf8"
);

function transpile(path, jsx = false) {
  return ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: jsx ? ts.JsxEmit.ReactJSX : undefined,
        esModuleInterop: true
      }
    }
  ).outputText;
}

function loadPresentation() {
  const exports = {};
  runInNewContext(transpile("../src/auth/profilePresentation.ts"), { exports });
  return exports;
}

function loadRoomFromUrl() {
  const normalizedAppSource = appSource.replace(/\r\n/g, "\n");
  const start = normalizedAppSource.indexOf("export function roomFromUrl(");
  const endMarker = "\n}\n\nfunction clearStoredRoomIdentity";
  const end = normalizedAppSource.indexOf(endMarker, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const exports = {};
  const source = normalizedAppSource.slice(start, end + 2);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText;
  runInNewContext(compiled, { exports, URLSearchParams });
  return exports.roomFromUrl;
}

function loadDriveClient({ response, windowOverrides = {} }) {
  const calls = [];
  const exports = {};
  const source = driveSource.replace(
    "import.meta.env.VITE_GOOGLE_CLIENT_ID",
    '"test-client-id"'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText;
  const window = {
    location: { origin: "https://play.example.test" },
    gapi: {},
    google: { accounts: { oauth2: {} } },
    ...windowOverrides
  };

  runInNewContext(compiled, {
    exports,
    window,
    Number,
    Error,
    Promise,
    JSON,
    require: name => name === "./api" ? { API_URL: "" } : requireFromHere(name)
  });

  const authenticatedFetch = async (url, options = {}) => {
    calls.push({ url, options });
    return typeof response === "function" ? response(url, options) : response;
  };
  return { exports, calls, authenticatedFetch, window };
}

function renderRegisteredProfile() {
  const React = requireFromHere("react");
  const { renderToStaticMarkup } = requireFromHere("react-dom/server");
  const exports = {};
  const iconModule = new Proxy({}, {
    get: (_target, name) => function Icon() {
      return React.createElement("span", { "data-icon": String(name) });
    }
  });
  const auth = {
    session: {
      authenticated: true,
      role: "USER",
      username: "Boss Phoenix",
      email: "boss@example.com"
    },
    authenticatedFetch: async () => ({ ok: true, json: async () => ({ connected: false }) }),
    refreshSession: async () => ({ authenticated: true, role: "USER" })
  };

  runInNewContext(transpile("../src/auth/ProfilePage.tsx", true), {
    exports,
    Promise,
    require: name => {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return requireFromHere("react/jsx-runtime");
      if (name === "lucide-react") return iconModule;
      if (name === "../components/LogoHomeLink") {
        return { __esModule: true, default: () => React.createElement("a", { href: "/" }, "SyncWatch") };
      }
      if (name === "./AuthProvider") return { useAuth: () => auth };
      if (name === "./profilePresentation") return loadPresentation();
      if (name === "../googleDriveConnection") {
        return {
          connectGoogleDriveAccount: async () => ({ connected: true }),
          disconnectGoogleDriveAccount: async () => ({ connected: false }),
          getGoogleDriveAccountStatus: async () => ({ connected: false })
        };
      }
      return requireFromHere(name);
    }
  });

  return renderToStaticMarkup(React.createElement(exports.default, { onLogout: async () => {} }));
}

test("profile route renders registered users, preserves login for anonymous users, and redirects guests", () => {
  assert.match(appSource, /authPath === "\/profile"/);
  assert.match(appSource, /<ProfilePage/);
  assert.match(appSource, /if \(!auth\.session\.authenticated\)[\s\S]*?<LoginPage/);
  assert.match(appSource, /guestSession[\s\S]*?<GuestProfileRedirect roomId=\{auth\.session\.allowedRoomId\}/);
  assert.match(appSource, /window\.location\.replace\(roomId \? `\/room\/\$\{encodeURIComponent\(roomId\)\}` : "\/"\)/);
});

test("room paths require the exact intended route shape", () => {
  const roomFromUrl = loadRoomFromUrl();
  assert.equal(roomFromUrl("/room/U2WKX6", ""), "U2WKX6");
  assert.equal(roomFromUrl("/room/U2WKX6/", ""), "U2WKX6");
  assert.equal(roomFromUrl("/room/U2WKX6/profile", ""), "");
  assert.equal(roomFromUrl("/room/U2WKX6/anything", ""), "");
  assert.equal(roomFromUrl("/room/U2WKX6/profile", "?room=OTHER1"), "");
  assert.equal(roomFromUrl("/profile", "?room=U2WKX6"), "");
  assert.equal(roomFromUrl("/", "?room=U2WKX6"), "U2WKX6");
});

test("all Profile navigation is absolute and cannot append to a room URL", () => {
  const navigationSources = `${appSource}\n${profileSource}\n${accountMenuSource}`;
  const profileNavigations = [...navigationSources.matchAll(/(?:href|pushState|replaceState)[^\n]*profile/gi)]
    .map(match => match[0]);
  assert.ok(profileNavigations.length > 0);
  assert.ok(profileNavigations.every(navigation => navigation.includes("/profile")));
  assert.doesNotMatch(navigationSources, /href="profile"|(?:pushState|replaceState)\([^\n]*["']profile["']/);
});

test("registered profile renders session identity, semantic sections, and a checking state", () => {
  const html = renderRegisteredProfile();
  assert.match(html, /<h1[^>]*>Boss Phoenix<\/h1>/);
  assert.match(html, /boss@example\.com/);
  assert.match(html, /<h2[^>]*>Account<\/h2>/);
  assert.match(html, /<h2[^>]*>Connected Services<\/h2>/);
  assert.match(html, /<h2[^>]*>Security<\/h2>/);
  assert.match(html, /<h2[^>]*>Session<\/h2>/);
  assert.match(html, /Checking\.\.\./);
  assert.match(html, /aria-label="Profile navigation"/);
});

test("profile initials are trimmed, Unicode-safe, and use sensible fallbacks", () => {
  const presentation = loadPresentation();
  assert.equal(presentation.profileInitials("  Boss Phoenix  ", "ignored@example.com"), "BP");
  assert.equal(presentation.profileInitials("李 雷", "ignored@example.com"), "李雷");
  assert.equal(presentation.profileInitials("李雷", "ignored@example.com"), "李雷");
  assert.equal(presentation.profileInitials("", "phoenix@example.com"), "PH");
  assert.equal(presentation.profileInitials("  ", "  "), "?");
  assert.equal(presentation.driveConnectionLabel("connected"), "Connected");
  assert.equal(presentation.driveConnectionLabel("disconnected"), "Not connected");
  assert.equal(presentation.driveConnectionLabel("checking"), "Checking...");
  assert.equal(presentation.driveConnectionLabel("error"), "Temporary error");
});

test("account status distinguishes connected, disconnected, and transient failures", async () => {
  for (const connected of [true, false]) {
    const client = loadDriveClient({
      response: { ok: true, json: async () => ({ connected, accessToken: "must-not-reach-profile" }) }
    });
    const status = await client.exports.getGoogleDriveAccountStatus(client.authenticatedFetch);
    assert.equal(status.connected, connected);
    assert.equal(client.calls[0].url, "/api/google/connection");
    assert.deepEqual(Object.keys(status), ["connected"]);
  }

  const failing = loadDriveClient({ response: { ok: false, json: async () => ({}) } });
  await assert.rejects(
    failing.exports.getGoogleDriveAccountStatus(failing.authenticatedFetch),
    /Could not check Google Drive/
  );
  assert.match(profileSource, /setDriveState\("error"\)/);
  assert.match(profileSource, /temporarily unavailable/);
  assert.doesNotMatch(profileSource, /accessToken|expiresAt/);
});

test("profile connect reuses the shared OAuth code exchange and disconnect uses DELETE", async () => {
  let oauthOptions;
  const client = loadDriveClient({
    response: async (url, options) => url.endsWith("/code")
      ? {
          ok: true,
          json: async () => ({ connected: true, accessToken: "temporary", expiresAt: 1234 })
        }
      : { ok: true, json: async () => ({}) },
    windowOverrides: {
      location: { origin: "https://play.example.test" },
      gapi: {},
      google: {
        accounts: {
          oauth2: {
            initCodeClient(options) {
              oauthOptions = options;
              return { requestCode: () => void options.callback({ code: "oauth-code" }) };
            }
          }
        }
      }
    }
  });

  const connected = await client.exports.connectGoogleDriveAccount(
    client.authenticatedFetch,
    async () => true
  );
  assert.equal(connected.connected, true);
  assert.equal(oauthOptions.scope, "https://www.googleapis.com/auth/drive.file");
  assert.equal(client.calls[0].url, "/api/google/code");
  assert.deepEqual(JSON.parse(client.calls[0].options.body), {
    code: "oauth-code",
    redirectUri: "https://play.example.test"
  });
  assert.match(appSource, /requestGoogleDriveAuthorizationCode\([\s\S]*?confirmHostSession/);
  assert.match(profileSource, /connectGoogleDriveAccount/);

  await client.exports.disconnectGoogleDriveAccount(client.authenticatedFetch);
  assert.equal(client.calls[1].url, "/api/google/connection");
  assert.equal(client.calls[1].options.method, "DELETE");
});

test("profile reuses reset and logout flows and is linked only from the home account menu", () => {
  const roomMenu = readFileSync(
    new URL("../src/components/RoomActionsMenu.tsx", import.meta.url),
    "utf8"
  );
  const mobileMenu = readFileSync(
    new URL("../src/mobile/MobileRoomHeader.tsx", import.meta.url),
    "utf8"
  );

  assert.match(profileSource, /href="\/forgot-password"/);
  assert.match(profileSource, /await onLogout\(\)/);
  assert.match(appSource, /await auth\.signOut\(\)[\s\S]*?window\.location\.replace\("\/"\)/);
  assert.match(appSource, /!roomId && !guestSession[\s\S]*?<HomeAccountMenu/);
  assert.match(accountMenuSource, /href="\/profile"/);
  assert.doesNotMatch(roomMenu, /\/profile|Profile/);
  assert.doesNotMatch(mobileMenu, /\/profile|Profile/);
});

test("registered home account menu reuses identity and absolute account routes", () => {
  assert.match(appSource, /email=\{guestSession \? null : auth\.session\.email\}/);
  assert.match(appSource, /<HomeAccountMenu[\s\S]*?username=\{username\}[\s\S]*?email=\{email\}[\s\S]*?onLogout=\{logout\}/);
  assert.match(accountMenuSource, /profileInitials\(username, email\)/);
  assert.match(accountMenuSource, /href="\/profile"/);
  assert.match(accountMenuSource, /href="\/forgot-password"/);
  assert.doesNotMatch(accountMenuSource, /href="profile"|href="forgot-password"/);
});

test("home account menu is accessible by pointer and keyboard", () => {
  assert.match(accountMenuSource, /aria-haspopup="menu"/);
  assert.match(accountMenuSource, /aria-expanded=\{open\}/);
  assert.match(accountMenuSource, /role="menu"/);
  assert.match(accountMenuSource, /role="menuitem"/);
  assert.match(accountMenuSource, /event\.key === "Escape"/);
  assert.match(accountMenuSource, /"ArrowDown"/);
  assert.match(accountMenuSource, /"ArrowUp"/);
  assert.match(accountMenuSource, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/);
  assert.match(accountMenuSource, /event\.relatedTarget/);
  assert.match(accountMenuSource, /item\?\.focus\(\)/);
});

test("home account logout reuses application cleanup and returns to the absolute home route", () => {
  assert.match(accountMenuSource, /await onLogout\(\)/);
  assert.match(appSource, /onLogout=\{logout\}/);
  assert.match(appSource, /async function logout\(\)[\s\S]*?await onLogout\(\)[\s\S]*?clearStoredRoomIdentity\(\)[\s\S]*?replaceState\(\{\}, "", "\/"\)/);
});

test("registered account menu remains home-only and nested room profile paths stay invalid", () => {
  const roomFromUrl = loadRoomFromUrl();
  assert.match(appSource, /!roomId && !guestSession \? \([\s\S]*?<HomeAccountMenu/);
  assert.equal(roomFromUrl("/room/U2WKX6", ""), "U2WKX6");
  assert.equal(roomFromUrl("/room/U2WKX6/profile", ""), "");
  assert.doesNotMatch(accountMenuSource, /\/room\/|roomId/);
});
