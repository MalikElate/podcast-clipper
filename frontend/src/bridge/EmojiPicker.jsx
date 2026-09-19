import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons.jsx";

const GROUPS = [
  ["Smileys", "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😜 🤪 😎 🤩 🥳 😏 😌 🤔 🤗 🤭 😴 😮 😢 😭 😤 😡 🥺 😱 🤯 🙃"],
  ["Hands & people", "👍 👎 👏 🙌 🙏 🤝 💪 👋 🤙 ✌️ 🤞 👌 👉 👇 ☝️ ✍️ 🫶 👀 🧠 💃 🕺 🙋 🤷 🙆"],
  ["Hearts & symbols", "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💖 💯 ✨ ⭐ 🌟 🔥 💥 ⚡ ✅ ❌ ❗ ❓ 💡 📌 📍 🔔 🎯 💬 💭 ➡️ ⬇️ 🆕 🆓"],
  ["Nature & food", "🌸 🌼 🌻 🌷 🌹 🌱 🌿 🍀 🌳 🌞 🌙 🌈 ☀️ 🌊 🍎 🍓 🍕 🍔 🍟 🍩 🍰 🎂 ☕ 🍷 🍹"],
  ["Activities & objects", "🎉 🎊 🎁 🎈 🏆 🥇 🎵 🎶 🎤 🎧 🎬 📸 📷 🎥 📱 💻 🎮 📚 ✏️ 📝 📈 📊 💼 💰 🛍️ 🚀 ✈️ 🏠 ⏰ 📅"],
].map(([name, list]) => [name, list.split(" ")]);

export default function EmojiPicker({ onPick }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (event.type === "keydown" ? event.key === "Escape" : !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return <div className="bridge-emoji" ref={root}>
    <button type="button" className="bridge-emoji-toggle" aria-label="Add emoji" aria-expanded={open} title="Add emoji" onClick={() => setOpen(value => !value)}><Icon name="emoji" size={18}/></button>
    {open && <div className="bridge-emoji-panel" role="dialog" aria-label="Choose an emoji">{GROUPS.map(([name, emojis]) => <div key={name}><small>{name}</small><div className="bridge-emoji-grid">{emojis.map(emoji => <button type="button" key={emoji} aria-label={emoji} onClick={() => onPick(emoji)}>{emoji}</button>)}</div></div>)}</div>}
  </div>;
}
