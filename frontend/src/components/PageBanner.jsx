import React from "react";

export default function PageBanner({
  icon: Icon,
  badge = null,
  title,
  description,
  actions = null,
  className = "",
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-800 p-4 sm:p-6 text-white shadow-md ${className}`}
    >
      {/* Decorative gradient overlay */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 size-48 sm:size-64 rounded-full bg-white/10 blur-2xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-8 -left-8 size-40 sm:size-48 rounded-full bg-blue-400/20 blur-xl"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          {Icon && (
            <div className="flex size-10 sm:size-12 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-white/15 backdrop-blur-md text-white shadow-xs">
              <Icon className="size-5 sm:size-6" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            {badge && <div className="mb-1">{badge}</div>}
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-white leading-snug">
              {title}
            </h1>
            {description && (
              <p className="mt-1 text-xs sm:text-sm text-blue-100/90 leading-relaxed max-w-2xl">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Nút hành động: full-width trên mobile, auto trên laptop */}
        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t border-white/15 sm:border-t-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
