import { FormEvent, useEffect, useState } from "react";
import { ApiError, api, clearSession, fileBase, hasSession, saveSession } from "./lib/api";

type User = { id: string; name: string; email: string; isAdmin: boolean };
type Thread = { id: string; name: string; email: string; last_body: string | null };
type Group = { id: string; title: string; code: string; last_body?: string | null };
type Message = {
  id: string;
  sender_role: "customer" | "admin";
  body: string;
  created_at: string;
  attachment_key?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
};

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
  if (!user) return <AuthScreen onDone={() => void refresh()} />;
  return <Inbox user={user} onLogout={() => { clearSession(); setUser(null); }} />;
}

function AuthScreen({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "register") {
      if (!name.trim()) {
        setError("Nhập họ tên.");
        return;
      }
      if (password.length < 8) {
        setError("Mật khẩu cần từ 8 ký tự.");
        return;
      }
      if (password !== confirm) {
        setError("Mật khẩu nhập lại chưa khớp.");
        return;
      }
    }
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload = mode === "login" ? { email, password } : { name, email, password };
      const data = await api<{ token?: string }>(path, { method: "POST", body: JSON.stringify(payload) });
      if (!data.token) {
        setError("Máy chủ chưa trả phiên đăng nhập.");
        return;
      }
      saveSession(data.token);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thực hiện được.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">WebStudio Admin</p>
      <h1 className="text-3xl font-extrabold">{mode === "login" ? "Đăng nhập" : "Đăng ký"}</h1>
      <p className="text-sm text-stone-400">
        {mode === "login" ? "Dùng email và mật khẩu đã tạo." : "Tạo tài khoản admin mới, rồi vào hộp tin."}
      </p>
      {mode === "register" && (
        <input className="rounded-2xl bg-[#24211f] px-4 py-3" placeholder="Họ tên" value={name} onChange={(event) => setName(event.target.value)} />
      )}
      <input className="rounded-2xl bg-[#24211f] px-4 py-3" type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <input className="rounded-2xl bg-[#24211f] px-4 py-3" type="password" placeholder="Mật khẩu" value={password} onChange={(event) => setPassword(event.target.value)} />
      {mode === "register" && (
        <input className="rounded-2xl bg-[#24211f] px-4 py-3" type="password" placeholder="Nhập lại mật khẩu" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="rounded-full bg-[#7c5cff] py-3 font-bold">{mode === "login" ? "Đăng nhập" : "Đăng ký"}</button>
      <button
        type="button"
        className="rounded-full border border-white/15 py-3 text-sm font-bold"
        onClick={() => {
          setError("");
          setMode(mode === "login" ? "register" : "login");
        }}
      >
        {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
      </button>
    </form>
  );
}

function Inbox({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState("");

  async function load(target?: string) {
    const groupId = target?.startsWith("g:") ? target.slice(2) : "";
    const query = groupId ? `?groupId=${encodeURIComponent(groupId)}` : target ? `?userId=${encodeURIComponent(target)}` : "";
    const data = await api<{ threads: Thread[]; groups?: Group[]; messages: Message[]; isAdmin: boolean }>("/api/chat" + query);
    if (!data.isAdmin) {
      setError("Tài khoản này chưa phải admin. Hãy đăng nhập lại trên trang admin.");
    }
    if (data.threads) setThreads(data.threads);
    if (data.groups) setGroups(data.groups);
    setMessages(data.messages);
  }

  useEffect(() => {
    void load(openId ?? undefined).catch(() => setError("Chưa tải được tin nhắn."));
    const timer = window.setInterval(() => {
      void load(openId ?? undefined).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [openId]);

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
    await api("/api/chat", {
      method: "POST",
      body: JSON.stringify(openId.startsWith("g:") ? { body, groupId: openId.slice(2) } : { body, userId: openId }),
    });
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
          {groups.map((group) => (
            <button key={group.id} type="button" onClick={() => void open("g:" + group.id)} className="block w-full border-b border-white/10 px-4 py-4 text-left last:border-0">
              <span className="block font-extrabold">{group.title}</span>
              <span className="mt-1 block text-xs text-violet-300">Nhóm {group.code}</span>
              <span className="mt-1 block truncate text-sm text-stone-300">{group.last_body || "Chưa có tin"}</span>
            </button>
          ))}
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
              <h2 className="text-lg font-extrabold">{openId.startsWith("g:") ? groups.find((item) => "g:" + item.id === openId)?.title || "Nhóm" : current?.name || "Khách"}</h2>
              {messages.map((message) => (
                <article key={message.id} className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${message.sender_role === "admin" ? "bg-[#3a2d78]" : "bg-[#24211f]"}`}>
                  <p className="mb-1 text-xs text-stone-400">{message.sender_role === "admin" ? "Admin" : "Khách"}</p>
                  {message.body && <p>{message.body}</p>}
                  {message.attachment_key && message.attachment_type?.startsWith("image/") && (
                    <img src={`${fileBase}/api/files/${message.attachment_key}`} alt="" className="mt-2 max-h-52 rounded-xl object-cover" />
                  )}
                  {message.attachment_key && !message.attachment_type?.startsWith("image/") && (
                    <a className="mt-2 block font-semibold text-violet-300" href={`${fileBase}/api/files/${message.attachment_key}`} target="_blank" rel="noreferrer">
                      Tệp: {message.attachment_name || "Tải xuống"}
                    </a>
                  )}
                </article>
              ))}
              {emojiOpen && (
                <div className="flex gap-2 overflow-auto">
                  {["😀", "😂", "😍", "👍", "🙏", "🎉", "❤️", "😢", "😮", "🔥", "✅"].map((emoji) => (
                    <button key={emoji} type="button" className="text-2xl" onClick={() => setText((value) => value + emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              <form onSubmit={(event) => void send(event)} className="flex gap-2">
                <label className="flex items-center rounded-2xl bg-[#24211f] px-3 text-lg">
                  📎
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/*,.pdf,.zip,.txt,.doc,.docx"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file || !openId) return;
                      const form = new FormData();
                      form.set("file", file);
                      if (openId.startsWith("g:")) form.set("groupId", openId.slice(2));
                      else form.set("userId", openId);
                      void api("/api/chat/file", { method: "POST", body: form }).then(() => load(openId));
                    }}
                  />
                </label>
                <button type="button" className="rounded-2xl bg-[#24211f] px-3 text-lg" onClick={() => setEmojiOpen((value) => !value)}>
                  😊
                </button>
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
