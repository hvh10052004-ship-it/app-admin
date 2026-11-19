import { FormEvent, useEffect, useState } from "react";
import { ApiError, api, clearSession, fileBase, hasSession, saveSession } from "./lib/api";

type User = { id: string; name: string; email: string; nickname?: string; isAdmin: boolean };
type Thread = { id: string; name: string; email: string; last_body: string | null; last_at?: string | null; last_sender_id?: string | null };
type Group = { id: string; title: string; code: string; owner_id?: string | null; avatarUrl?: string | null; last_body?: string | null; last_at?: string | null; last_sender_id?: string | null };
type Message = {
  id: string;
  sender_role: "customer" | "admin";
  sender_id?: string;
  sender_name?: string | null;
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
  const [slide, setSlide] = useState<"in" | "out">("in");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [viewImage, setViewImage] = useState("");
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [setting, setSetting] = useState<"nick" | "email" | "pass" | null>(null);
  const [nickname, setNickname] = useState(user.nickname || "");
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [notice, setNotice] = useState("");

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

  function open(id: string, at: string) {
    markAdminSeen(id, at);
    setSlide("in");
    setOpenId(id);
    setError("");
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

  const openGroup = groups.find((item) => "g:" + item.id === openId);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-3 px-4 py-6">
      {!openId && (
        <>
          <header className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Chat</p>
              <h1 className="text-[28px] font-extrabold tracking-tight">Tin nhắn</h1>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => { setMenu(true); setSetting(null); setNotice(""); }} className="flex h-10 w-10 flex-col items-center justify-center gap-1 rounded-2xl bg-[#24211f]" aria-label="Tài khoản">
                <span className="h-0.5 w-4 bg-white" />
                <span className="h-0.5 w-4 bg-white" />
                <span className="h-0.5 w-4 bg-white" />
              </button>
            </div>
          </header>
          {menu && (
            <div className="fixed inset-0 z-30">
              <button type="button" className="absolute inset-0 bg-black/40" aria-label="Đóng" onClick={() => setMenu(false)} />
              <aside className="chat-slide-in absolute top-0 right-0 flex h-full w-1/2 flex-col overflow-y-auto bg-[#1c1917] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Tài khoản</p>
                {([
                  ["nick", "Biệt danh"],
                  ["email", "Email"],
                  ["pass", "Mật khẩu"],
                ] as const).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => { setSetting(id); setNotice(""); }} className="mt-2 rounded-2xl bg-[#24211f] px-3 py-3 text-left font-semibold">
                    {label}
                  </button>
                ))}
                {setting === "nick" && (
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setNotice("");
                      void api("/api/me", { method: "PATCH", body: JSON.stringify({ name: user.name, nickname }) })
                        .then(() => setNotice("Đã lưu biệt danh."))
                        .catch((err) => setNotice(err instanceof ApiError ? err.message : "Chưa lưu được."));
                    }}
                  >
                    <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Biệt danh" className="w-full rounded-2xl bg-[#141210] px-3 py-3" />
                    <button className="w-full rounded-2xl bg-[#7c5cff] py-3 font-bold">Lưu</button>
                  </form>
                )}
                {setting === "email" && (
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setNotice("");
                      void api("/api/me/security", { method: "POST", body: JSON.stringify({ email, currentPassword, newPassword: "" }) })
                        .then(() => setNotice("Đã đổi email."))
                        .catch((err) => setNotice(err instanceof ApiError ? err.message : "Chưa đổi được email."));
                    }}
                  >
                    <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email mới" className="w-full rounded-2xl bg-[#141210] px-3 py-3" />
                    <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" placeholder="Mật khẩu hiện tại" className="w-full rounded-2xl bg-[#141210] px-3 py-3" />
                    <button className="w-full rounded-2xl bg-[#7c5cff] py-3 font-bold">Lưu</button>
                  </form>
                )}
                {setting === "pass" && (
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setNotice("");
                      void api("/api/me/security", { method: "POST", body: JSON.stringify({ email: user.email, currentPassword, newPassword }) })
                        .then(() => {
                          setCurrentPassword("");
                          setNewPassword("");
                          setNotice("Đã đổi mật khẩu.");
                        })
                        .catch((err) => setNotice(err instanceof ApiError ? err.message : "Chưa đổi được mật khẩu."));
                    }}
                  >
                    <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" placeholder="Mật khẩu hiện tại" className="w-full rounded-2xl bg-[#141210] px-3 py-3" />
                    <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" placeholder="Mật khẩu mới" className="w-full rounded-2xl bg-[#141210] px-3 py-3" />
                    <button className="w-full rounded-2xl bg-[#7c5cff] py-3 font-bold">Lưu</button>
                  </form>
                )}
                {notice && <p className="mt-3 text-sm text-violet-200">{notice}</p>}
                <button type="button" onClick={onLogout} className="mt-auto rounded-2xl bg-[#24211f] py-3 font-bold">Đăng xuất</button>
              </aside>
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!user.isAdmin && <p className="rounded-2xl bg-[#24211f] p-4 text-sm">Email đang dùng: {user.email}</p>}
          {threads.length === 0 && groups.length === 0 && <p className="text-sm text-stone-400">Chưa có tin từ khách.</p>}
          {inboxRows(groups, threads, user.id).map((row) => (
            <button key={row.id} type="button" onClick={() => open(row.id, row.at)} className="block w-full rounded-3xl bg-[#24211f] px-4 py-4 text-left">
              <span className="flex items-center justify-between gap-2">
                <span className={`truncate ${row.unread ? "font-extrabold text-white" : "font-semibold text-stone-400"}`}>{row.title}</span>
                <span className={`shrink-0 text-xs ${row.unread ? "font-bold text-white" : "text-stone-500"}`}>{chatTime(row.at)}</span>
              </span>
              <span className={`mt-1 block truncate text-sm ${row.unread ? "font-semibold text-stone-100" : "text-stone-500"}`}>{row.preview}</span>
            </button>
          ))}
        </>
      )}

      {openId && (
        <div
          className={`fixed inset-0 z-20 mx-auto flex w-full max-w-md flex-col bg-[#141210] ${slide === "out" ? "chat-slide-out" : "chat-slide-in"}`}
          onAnimationEnd={() => {
            if (slide === "out") {
              setOpenId(null);
              setSlide("in");
            }
          }}
        >
          <header className="flex items-center gap-2 border-b border-white/10 bg-[#1c1917] px-2 py-3">
            <button type="button" onClick={() => setSlide("out")} className="flex h-10 w-10 items-center justify-center text-2xl" aria-label="Thoát cuộc nhắn">
              ←
            </button>
            {openId.startsWith("g:") && (
              openGroup?.avatarUrl ? (
                <img src={`${fileBase}${openGroup.avatarUrl}`} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#3a2d78] text-sm font-bold">{(openGroup?.title || "N").slice(0, 1)}</span>
              )
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-extrabold">{openId.startsWith("g:") ? openGroup?.title || "Nhóm" : current?.name || "Khách"}</h1>
              <p className="truncate text-xs text-stone-400">{openId.startsWith("g:") ? "Nhóm khách" : current?.email}</p>
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 && <p className="text-sm text-stone-400">Chưa có tin.</p>}
            {messages.map((message) => {
              const mine = message.sender_id === user.id;
              const label = message.sender_name || (mine ? user.nickname || user.name : "") || (message.sender_role === "admin" ? "Admin" : "Khách");
              return (
              <article key={message.id} className={`w-fit max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${mine ? "self-start bg-[#24211f]" : "self-end bg-[#3a2d78]"}`}>
                <p className="mb-1 flex justify-between gap-3 text-xs font-bold text-violet-200"><span>{label}</span><span className="font-semibold text-stone-400">{chatTime(message.created_at)}</span></p>
                {message.body && <p>{message.body}</p>}
                {(message.attachment_key && (message.attachment_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(message.attachment_name || message.attachment_key))) ? (
                  <button type="button" className="mt-2 block" onClick={() => setViewImage(`${fileBase}/api/files/${message.attachment_key!.split("/").map(encodeURIComponent).join("/")}`)}>
                    <img src={`${fileBase}/api/files/${message.attachment_key!.split("/").map(encodeURIComponent).join("/")}`} alt="" className="h-24 w-24 rounded-xl object-cover" />
                  </button>
                ) : message.attachment_key ? (
                  <a className="mt-2 block font-semibold text-violet-300" href={`${fileBase}/api/files/${message.attachment_key}`} target="_blank" rel="noreferrer">
                    Tệp: {message.attachment_name || "Tải xuống"}
                  </a>
                ) : null}
              </article>
              );
            })}
          </div>
          {emojiOpen && (
            <div className="flex gap-2 overflow-auto px-3 pb-2">
              {["😀", "😂", "😍", "👍", "🙏", "🎉", "❤️", "😢", "😮", "🔥", "✅"].map((emoji) => (
                <button key={emoji} type="button" className="text-2xl" onClick={() => setText((value) => value + emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={(event) => void send(event)} className="flex gap-2 border-t border-white/10 bg-[#141210] px-3 py-2">
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
      {viewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setViewImage("")}>
          <img src={viewImage} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  );
}

function chatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function readAdminSeen() {
  try {
    return JSON.parse(localStorage.getItem("webstudio-admin-seen") || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function markAdminSeen(id: string, at: string) {
  const seen = readAdminSeen();
  seen[id] = at || new Date().toISOString();
  localStorage.setItem("webstudio-admin-seen", JSON.stringify(seen));
}

function inboxRows(groups: Group[], threads: Thread[], userId: string) {
  const seen = readAdminSeen();
  const rows = [
    ...groups.map((group) => ({
      id: "g:" + group.id,
      title: group.title,
      preview: group.last_body || "Chưa có tin",
      at: group.last_at || "",
      sender: group.last_sender_id,
    })),
    ...threads.map((thread) => ({
      id: thread.id,
      title: thread.name,
      preview: thread.last_body || thread.email,
      at: thread.last_at || "",
      sender: thread.last_sender_id,
    })),
  ];
  return rows
    .map((row) => ({ ...row, unread: Boolean(row.at && row.sender && row.sender !== userId && (seen[row.id] || "") < row.at) }))
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}
