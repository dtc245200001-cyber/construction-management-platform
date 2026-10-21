import React from "react";

/**
 * PageHeroBanner - Khối tiêu đề Hero Banner màu xanh chuẩn của hệ thống Công Trường 360
 * Thiết kế đồng bộ với WBSPage, SchedulePage, GanttPage
 * 
 * @param {React.ReactNode} icon - Icon chính đặt trong khung vuông bo góc xanh dương
 * @param {string|React.ReactNode} title - Tiêu đề chính trang (render trong thẻ <h1>)
 * @param {string|React.ReactNode} subtitle - Phụ đề hoặc tên dự án đang làm việc
 * @param {React.ReactNode} badge - Huy hiệu phụ cạnh tiêu đề (tuỳ chọn)
 * @param {React.ReactNode} children - Cụm nút hành động bên phải banner (tuỳ chọn)
 * @param {string} bgImage - Ảnh nền công trường (tuỳ chọn)
 * @param {string} className - Class CSS tuỳ biến thêm vào container
 */
export default function PageHeroBanner({
  icon,
  title,
  subtitle,
  badge = null,
  children = null,
  bgImage = "https://images.unsplash.com/photo-1541888086425-d81bb19240f5?auto=format&fit=crop&q=80",
  className = "",
}) {
  return (
    <div
      className={`relative min-h-[96px] sm:min-h-[115px] rounded-2xl overflow-hidden shrink-0 flex items-center p-4 sm:p-6 shadow-sm ${className}`}
    >
      {/* Ảnh nền công trình */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url('${bgImage}')` }}
      />
      {/* Lớp phủ dải màu xanh thương hiệu Công Trường 360 */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0B3FA8] via-[#0B3FA8]/92 to-transparent opacity-95" />

      {/* Nội dung Banner */}
      <div className="relative z-10 flex w-full flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-5">
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          {icon && (
            <div className="size-10 sm:size-[56px] bg-[#1F63E0] rounded-xl flex items-center justify-center shadow-lg border border-white/20 shrink-0 text-white">
              {React.isValidElement(icon)
                ? React.cloneElement(icon, {
                    className: `size-6 sm:size-8 text-white ${icon.props?.className || ""}`.trim(),
                  })
                : icon}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="text-white text-lg sm:text-[26px] md:text-[28px] font-bold leading-tight">
                {title}
              </h1>
              {badge}
            </div>
            {subtitle && (
              <p className="text-white/90 text-xs sm:text-[14px] md:text-[15px] font-medium mt-1 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Cụm nút hành động bên phải */}
        {children && (
          <div className="flex items-center flex-wrap gap-2 shrink-0 self-start sm:self-center">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
