import { DashboardShell } from "./components/dashboard-shell";
import { createSwitchpathApiSession } from "./api-session";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";

export default async function Home() {
  const user = await getChatGPTUser();
  const requireAuth = process.env.SWITCHPATH_REQUIRE_AUTH === "true";
  if (requireAuth && !user) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <span className="section-index">Switchpath workspace</span>
          <h1>Research routes belong to your team.</h1>
          <p>Sign in to keep playbooks, evidence, interventions and learned preferences isolated to your workspace.</p>
          <a href={chatGPTSignInPath("/")}>Sign in with ChatGPT →</a>
        </section>
      </main>
    );
  }
  const apiToken = user ? createSwitchpathApiSession(user) : undefined;
  return <DashboardShell apiToken={apiToken} signedInUser={user ? { name: user.displayName, email: user.email } : undefined} />;
}
