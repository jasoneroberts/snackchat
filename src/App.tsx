import { useCallback, useEffect, useState } from "react";
import { api, type Me } from "./api";
import { Link } from "./components/Link";
import { TabBar } from "./components/TabBar";
import { matchPath, navigate, usePath } from "./router";
import { Boards } from "./pages/Boards";
import { CheckIn } from "./pages/CheckIn";
import { ComingSoon } from "./pages/ComingSoon";
import { Feed } from "./pages/Feed";
import { Group } from "./pages/Group";
import { Groups } from "./pages/Groups";
import { Home, VerifyNotice } from "./pages/Home";
import { Invite } from "./pages/Invite";
import { Join } from "./pages/Join";
import { LogIn } from "./pages/LogIn";
import { NewGroup } from "./pages/NewGroup";
import { Profile } from "./pages/Profile";
import { QuickSignIn } from "./pages/QuickSignIn";
import { Settings } from "./pages/Settings";
import { Review } from "./pages/Review";
import { SignUp } from "./pages/SignUp";
import { Snack } from "./pages/Snack";

interface Toast {
  title: string;
  body: string;
}

export function App() {
  const path = usePath();
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = still loading
  const [devLogin, setDevLogin] = useState(false);
  const [quickSignIn, setQuickSignIn] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const refreshMe = useCallback(async () => {
    const { user, devLogin, quickSignIn } = await api<{ user: Me | null; devLogin?: boolean; quickSignIn?: boolean }>(
      "/me",
    );
    setMe(user);
    setDevLogin(devLogin === true);
    setQuickSignIn(quickSignIn === true);
  }, []);

  useEffect(() => {
    refreshMe().catch(() => setMe(null));
  }, [refreshMe]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const logOut = async () => {
    await api("/auth/logout", { method: "POST" });
    setMe(null);
    navigate("/");
  };

  const onSignedIn = async () => {
    await refreshMe();
    // Came from a group invite link before signing in? Carry on to it.
    navigate(readPendingJoin() ?? "/");
  };

  const refresh = () => void refreshMe().catch(() => {});

  if (me === undefined) return <p className="muted page">Loading…</p>;

  // Signed out: the welcome page, sign-up and log-in, without the tab bar.
  if (!me) {
    let page;
    if (quickSignIn) {
      // Testing mode: one name-and-PIN form instead of sign-up and log-in.
      if (path.startsWith("/join/")) savePendingJoin(path);
      page = (
        <>
          <Home quick />
          <QuickSignIn onSignedIn={onSignedIn} />
        </>
      );
    } else if (path === "/signup") page = <SignUp onSignedIn={onSignedIn} />;
    else if (path === "/login") page = <LogIn onSignedIn={onSignedIn} />;
    else {
      if (path.startsWith("/join/")) savePendingJoin(path);
      page = <Home />;
    }
    return (
      <div className="app">
        <header className="topbar">
          <Link href="/" className="brand">
            <img src="/logo.svg" alt="" width={32} height={32} />
            <span>snackchat</span>
          </Link>
          <nav className={quickSignIn ? "hidden" : "row"}>
            <Link href="/login">Log in</Link>
            <Link href="/signup" className="button small">
              Join
            </Link>
          </nav>
        </header>
        <main>{page}</main>
      </div>
    );
  }

  // Signed in: the app shell with the bottom tab bar.
  const snackId = matchPath("/snack/", path);
  const groupId = path === "/groups/new" ? null : matchPath("/groups/", path);
  const inviteGroupId = path.match(/^\/groups\/([^/]+)\/invite$/)?.[1] ?? null;
  const joinCode = matchPath("/join/", path);
  const profileName = path === "/me" ? me.username : matchPath("/u/", path);

  let page;
  let title = "snackchat";
  let tab = "";
  if (path === "/") {
    tab = "/";
    page = <Feed me={me} onChanged={refresh} />;
  } else if (path === "/checkin") {
    tab = "/checkin";
    title = "Check in";
    page = (
      <CheckIn
        key={window.location.search}
        onDone={(name, points, withPhoto) => {
          const photoNote = withPhoto ? " Your photo shows once it's approved." : "";
          setToast({ title: points > 0 ? `+${points} pts` : "Checked in", body: `${name} is on the board.${photoNote}` });
          refresh();
          navigate("/");
        }}
      />
    );
  } else if (path === "/boards") {
    tab = "/boards";
    title = "Boards";
    page = <Boards me={me} />;
  } else if (path === "/groups") {
    tab = "/groups";
    title = "Groups";
    page = <Groups />;
  } else if (path === "/groups/new") {
    title = "New group";
    page = <NewGroup />;
  } else if (inviteGroupId) {
    title = "Invite";
    page = <Invite id={inviteGroupId} />;
  } else if (groupId) {
    title = "Group";
    page = <Group id={groupId} me={me} />;
  } else if (joinCode) {
    title = "Join a group";
    page = <Join code={joinCode} />;
  } else if (path === "/settings") {
    title = "Settings";
    page = <Settings me={me} onChanged={refreshMe} />;
  } else if (path === "/review" && me.isAdmin) {
    title = "Approvals";
    page = <Review onChanged={refresh} />;
  } else if (snackId) {
    page = <Snack id={snackId} me={me} />;
  } else if (profileName) {
    tab = profileName.toLowerCase() === me.username.toLowerCase() ? "/me" : "";
    page = <Profile username={profileName} me={me} devLogin={devLogin} onLogOut={logOut} onChanged={refresh} />;
  } else {
    page = <ComingSoon title="Page not found">That link doesn't go anywhere.</ComingSoon>;
  }
  const showBack = !tab;

  return (
    <div className="shell">
      <header className="appbar">
        <div className="row">
          {showBack && (
            <button type="button" className="icon-button" aria-label="Back" onClick={() => history.back()}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          <Link href="/" className="brand">
            <img src="/logo.svg" alt="" width={32} height={32} />
            <span>{title}</span>
          </Link>
        </div>
        <div className="row">
          {devLogin && (
            <span className="dev-badge" title="Dev login is on: everyone with the link is signed in as this user">
              dev
            </span>
          )}
          <Link href="/me" className="points-pill">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--orange-dark)" strokeWidth="2.4"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
              <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
            </svg>
            {me.points} pts
          </Link>
        </div>
      </header>
      <main className="shell-main">
        <VerifyNotice me={me} />
        {page}
      </main>
      {toast && (
        <div className="toast" role="status">
          <span className="grow">
            <b>{toast.title}</b>
            <br />
            {toast.body}
          </span>
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
      <TabBar active={tab} />
    </div>
  );
}

const PENDING_JOIN = "snackchat.pendingJoin";

function savePendingJoin(path: string) {
  try {
    sessionStorage.setItem(PENDING_JOIN, path);
  } catch {
    // Private browsing can block storage; they'll just land on the feed.
  }
}

function readPendingJoin(): string | null {
  try {
    const path = sessionStorage.getItem(PENDING_JOIN);
    sessionStorage.removeItem(PENDING_JOIN);
    return path;
  } catch {
    return null;
  }
}
