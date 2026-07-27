import { useState } from "react";

interface AuthorAvatarProps {
  name: string;
  src?: string | null;
  size?: "small" | "medium";
}

export function AuthorAvatar({ name, src, size = "medium" }: AuthorAvatarProps) {
  const [failed, setFailed] = useState(false);
  const sizeClass = size === "small" ? "size-6 text-[10px]" : "size-10 text-sm";
  const className = `${sizeClass} shrink-0 rounded-full`;

  if (src && !failed) {
    return (
      <img
        alt={`${name}的头像`}
        className={`${className} object-cover`}
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        src={src}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`${className} grid place-items-center bg-stone-900 font-semibold text-white`}
    >
      {name.slice(0, 1)}
    </span>
  );
}
