interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

export function Card({ children, className = "", title, action }: CardProps) {
  return (
    <div
      className={[
        "bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden",
        className,
      ].join(" ")}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          {title && <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
