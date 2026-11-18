import { FormEvent, useEffect, useState } from "react";
import { ApiError, api, clearSession, hasSession, saveSession } from "./lib/api";

type User = { id: string; name: string; email: string; isAdmin: boolean };
type Thread = { id: string; name: string; email: string; last_body: string | null };
type Message = { id: string; sender_role: "customer" | "admin"; body: string; created_at: string };

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  async function refresh() {
    if (!hasSession()) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      const data = await api<{ user: User | null }>("/api/auth/me");
      setUser(data.user);
    } catch {
      clearSession();
      setUser(null);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (!ready) return <p className="p-6 text-sm text-stone-400">Đang mở…</p>;
  if (!user) return <Login onDone={() => void refresh()} />;
  return <Inbox user={user} onLogout={() => { clearSession(); setUser(null); }} />;
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await api<{ token?: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!data.token) {
        setError("Máy chủ chưa trả phiên đăng nhập.");
        return;
      }
      saveSession(data.token);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không đăng nhập được.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">WebStudio</p>
      <h1 className="text-3xl font-extrabold">Admin</h1>
      <p className="text-sm text-stone-400">Đăng nhập bằng email đã đặt trong ADMIN_EMAIL trên Worker.</p>
      <input className="rounded-2xl bg-[#24211f] px-4 py-3" type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <input className="rounded-2xl bg-[#24211f] px-4 py-3" type="password" placeholder="Mật khẩu" value={password} onChange={(event) => setPassword(event.target.value)} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="rounded-full bg-[#7c5cff] py-3 font-bold">Vào hộp tin</button>
    </form>
  );
}

function Inbox({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  async function load(userId?: string) {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const data = await api<{ threads: Thread[]; messages: Message[]; isAdmin: boolean }>("/api/chat" + query);
    if (!data.isAdmin) {
      setError("Tài khoản này chưa phải admin. Hãy đặt ADMIN_EMAIL trùng email đang đăng nhập, rồi Deploy Worker.");
    }
    setThreads(data.threads);
    setMessages(data.messages);
  }

  useEffect(() => {
    void load().catch(() => setError("Chưa tải được tin nhắn."));
  }, []);

  async function open(id: string) {
    setOpenId(id);
    setError("");
    try {
      await load(id);
    } catch {
      setError("Không mở được nội dung.");
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || !openId) return;
    await api("/api/chat", { method: "POST", body: JSON.stringify({ body, userId: openId }) });
    setText("");
    await load(openId);
  }

  const current = threads.find((item) => item.id === openId);

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Hộp tin</p>
          <h1 className="text-2xl font-extrabold">{user.name}</h1>
        </div>
        <button type="button" onClick={onLogout} className="rounded-2xl bg-[#24211f] px-4 py-2 text-sm font-bold">Đăng xuất</button>
      </header>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {!user.isAdmin && <p className="mb-4 rounded-2xl bg-[#24211f] p-4 text-sm">Email đang dùng: {user.email}</p>}
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="overflow-hidden rounded-3xl bg-[#24211f]">
          {threads.length === 0 && <p className="p-4 text-sm text-stone-400">Chưa có tin từ khách.</p>}
          {threads.map((thread) => (
            <button key={thread.id} type="button" onClick={() => void open(thread.id)} className="block w-full border-b border-white/10 px-4 py-4 text-left last:border-0">
              <span className="block font-extrabold">{thread.name}</span>
              <span className="mt-1 block text-xs text-stone-400">{thread.email}</span>
              <span className="mt-1 block truncate text-sm text-stone-300">{thread.last_body}</span>
            </button>
          ))}
        </div>
        <section className="rounded-3xl bg-[#1c1917] p-4">
          {!openId && <p className="text-sm text-stone-400">Chọn một khách để xem nội dung đã soạn.</p>}
          {openId && (
            <div className="space-y-3">
              <h2 className="text-lg font-extrabold">{current?.name || "Khách"}</h2>
              {messages.map((message) => (
                <article key={message.id} className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${message.sender_role === "admin" ? "bg-[#3a2d78]" : "bg-[#24211f]"}`}>
                  <p className="mb-1 text-xs text-stone-400">{message.sender_role === "admin" ? "Admin" : "Khách"}</p>
                  {message.body}
                </article>
              ))}
              <form onSubmit={(event) => void send(event)} className="flex gap-2">
                <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Trả lời khách" className="flex-1 rounded-2xl bg-[#24211f] px-4 py-3" />
                <button className="rounded-2xl bg-[#7c5cff] px-4 font-bold">Gửi</button>
              </form>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
