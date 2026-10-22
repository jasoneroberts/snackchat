import { useCallback, useEffect, useState } from "react";
import { api, type Me } from "./api";
import { Link } from "./components/Link";
import { navigate, usePath } from "./router";
import { Home } from "./pages/Home";
import { LogIn } from "./pages/LogIn";
import { SignUp } from "./pages/SignUp";

export function App() {
  const path = usePath();
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined = still loading
  const [devLogin, setDevLogin] = useState(false);

  const refreshMe = useCallback(async () => {
    const { user, devLogin } = await api<{ user: Me | null; devLogin?: boolean }>("/me");
    setMe(user);
    setDevLogin(devLogin === true);
  }, []);

  useEffect(() => {
    refreshMe().catch(() => setMe(null));
  }, [refreshMe]);

  const logOut = async () => {
    await api("/auth/logout", { method: "POST" });
    setMe(null);
    navigate("/");
  };

  const onSignedIn = async () => {
    await refreshMe();
    navigate("/");
  };

  let page;
  if (path === "/signup") page = <SignUp onSignedIn={onSignedIn} />;
  else if (path === "/login") page = <LogIn onSignedIn={onSignedIn} />;
  else page = <Home me={me} />;

  return (
    <div className="app">
      <header className="topbar">
        <Link href="/" className="brand">
          <img src="/logo.svg" alt="" width={32} height={32} />
          <span>snackchat</span>
        </Link>
        <nav>
          {me ? (
            <>
              <span className="who">@{me.username}</span>
              {devLogin ? (
                <span className="dev-badge" title="Dev login is on: everyone with the link is signed in as this user">
                  dev
                </span>
              ) : (
                <button className="link-button" onClick={logOut}>
                  Log out
                </button>
              )}
            </>
          ) : me === null ? (
            <>
              <Link href="/login">Log in</Link>
              <Link href="/signup" className="button small">
                Join
              </Link>
            </>
          ) : null}
        </nav>
      </header>
      <main>{page}</main>
    </div>
  );
}
