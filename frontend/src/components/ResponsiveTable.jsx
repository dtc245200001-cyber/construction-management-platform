import React from "react";

/**
 * ResponsiveTable:
 * - Desktop/Laptop (>= 768px): Render chuẩn HTML <table> có hỗ trợ sticky header và cuộn ngang an toàn
 * - Mobile (< 768px): Tự động chuyển đổi từng hàng dữ liệu thành 1 CARD xếp dọc, nhãn: giá trị rõ ràng,
 *   không bao giờ bị cụt chữ hoặc vỡ bố cục.
 */
export default function ResponsiveTable({
  columns = [],
  data = [],
  keyField = "id",
  emptyMessage = "Không có dữ liệu.",
  isLoading = false,
  renderMobileCard = null,
  className = "",
}) {
  if (isLoading) {
    return (
      <div className="w-full space-y-3 py-6">
        <div className="h-10 w-full animate-pulse rounded-xl bg-muted/60" />
        <div className="h-14 w-full animate-pulse rounded-xl bg-muted/40" />
        <div className="h-14 w-full animate-pulse rounded-xl bg-muted/40" />
        <div className="h-14 w-full animate-pulse rounded-xl bg-muted/40" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const primaryCol = columns.find((c) => c.isPrimary) || columns[0];
  const regularCols = columns.filter((c) => c !== primaryCol && !c.isAction);
  const actionCol = columns.find((c) => c.isAction);

  return (
    <div className={`w-full ${className}`}>
      {/* 1. HIỂN THỊ DẠNG CARD TRÊN MOBILE (< 768px) */}
      <div className="flex flex-col gap-3 md:hidden">
        {data.map((row, index) => {
          const rowKey = row[keyField] ?? index;

          if (renderMobileCard) {
            return (
              <React.Fragment key={rowKey}>
                {renderMobileCard(row, index)}
              </React.Fragment>
            );
          }

          return (
            <div
              key={rowKey}
              className="rounded-2xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-sm"
            >
              {/* Tiêu đề chính của Card */}
              {primaryCol && (
                <div className="pb-2.5 border-b border-border/60">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">
                    {primaryCol.header}
                  </span>
                  <div className="text-sm font-bold text-foreground">
                    {primaryCol.render
                      ? primaryCol.render(row[primaryCol.key], row, index)
                      : row[primaryCol.key] ?? "—"}
                  </div>
                </div>
              )}

              {/* Các thông tin chi tiết: Nhãn : Giá trị */}
              <div className="divide-y divide-border/40 py-1 text-xs">
                {regularCols.map((col) => {
                  const val = row[col.key];
                  return (
                    <div
                      key={col.key}
                      className="flex items-center justify-between py-2 gap-3"
                    >
                      <span className="text-muted-foreground shrink-0 font-medium">
                        {col.mobileLabel || col.header}:
                      </span>
                      <div className="text-right font-semibold text-foreground truncate max-w-[65%]">
                        {col.render ? col.render(val, row, index) : val ?? "—"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Hàng nút thao tác (nếu có) */}
              {actionCol && (
                <div className="pt-2.5 mt-1 border-t border-border/60 flex items-center justify-end gap-2">
                  {actionCol.render
                    ? actionCol.render(row[actionCol.key], row, index)
                    : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 2. HIỂN THỊ BẢNG ĐẦY ĐỦ TRÊN TABLET & LAPTOP (>= 768px) */}
      <div className="hidden md:block w-full overflow-x-auto rounded-2xl border border-border bg-card shadow-xs">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/60 text-xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border backdrop-blur-xs">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-4 py-3.5 ${col.className || ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {data.map((row, index) => {
              const rowKey = row[keyField] ?? index;
              return (
                <tr
                  key={rowKey}
                  className="transition-colors hover:bg-muted/30"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-foreground ${
                        col.className || ""
                      }`}
                    >
                      {col.render
                        ? col.render(row[col.key], row, index)
                        : row[col.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
