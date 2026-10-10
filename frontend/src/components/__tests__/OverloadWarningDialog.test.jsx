import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import OverloadWarningDialog from '../OverloadWarningDialog';

describe('OverloadWarningDialog (T-57 / S-25)', () => {
  const sampleWarning = {
    is_overloaded: true,
    threshold: 3,
    max_concurrent: 4,
    message: 'Cảnh báo quá tải: Đội có 4 công việc chồng lịch từ ngày 2026-10-15 đến ngày 2026-10-18 (4 ngày, vượt ngưỡng 3 việc).',
    overloaded_intervals: [
      {
        start_date: '2026-10-15',
        end_date: '2026-10-18',
        duration_days: 4,
        concurrent_count: 4,
        tasks: [
          { id: 101, name: 'Đào móng', start_date: '2026-10-10', end_date: '2026-10-20', is_critical: true, work_item_name: 'Móng' },
          { id: 102, name: 'Gia công cốt thép', start_date: '2026-10-12', end_date: '2026-10-22', is_critical: false, work_item_name: 'Móng' },
          { id: 103, name: 'Lắp dựng cốp pha', start_date: '2026-10-14', end_date: '2026-10-25', is_critical: false, work_item_name: 'Móng' },
          { id: 104, name: 'Đổ bê tông lót', start_date: '2026-10-15', end_date: '2026-10-18', is_critical: true, work_item_name: 'Móng' },
        ],
      },
    ],
  };

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <OverloadWarningDialog
        isOpen={false}
        warning={sampleWarning}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders overload warning modal with exact overlapping interval and 4 tasks', () => {
    render(
      <OverloadWarningDialog
        isOpen={true}
        warning={sampleWarning}
        teamName="Đội Xây dựng 1"
        taskName="Đổ bê tông lót"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    // Title & Team
    expect(screen.getByText('Cảnh báo quá tải đội thi công')).toBeInTheDocument();
    expect(screen.getByText(/"Đội Xây dựng 1"/i)).toBeInTheDocument();
    expect(screen.getByText(/"Đổ bê tông lót"/i)).toBeInTheDocument();

    // Overlapping interval details
    expect(screen.getByText(/4 ngày/i)).toBeInTheDocument();
    expect(screen.getByText(/4 việc đồng thời/i)).toBeInTheDocument();

    // 4 overlapping tasks
    expect(screen.getByText(/1\. Đào móng/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Gia công cốt thép/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Lắp dựng cốp pha/i)).toBeInTheDocument();
    expect(screen.getByText(/4\. Đổ bê tông lót/i)).toBeInTheDocument();

    // Buttons
    expect(screen.getByText('Hủy / Chọn đội khác')).toBeInTheDocument();
    expect(screen.getByText('Tôi đã hiểu, vẫn giao việc')).toBeInTheDocument();
  });

  it('triggers onConfirm when "Tôi đã hiểu, vẫn giao việc" button is clicked', () => {
    const handleConfirm = vi.fn();
    render(
      <OverloadWarningDialog
        isOpen={true}
        warning={sampleWarning}
        teamName="Đội Xây dựng 1"
        taskName="Đổ bê tông lót"
        onClose={vi.fn()}
        onConfirm={handleConfirm}
      />
    );

    fireEvent.click(screen.getByText('Tôi đã hiểu, vẫn giao việc'));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('triggers onClose when "Hủy / Chọn đội khác" button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <OverloadWarningDialog
        isOpen={true}
        warning={sampleWarning}
        teamName="Đội Xây dựng 1"
        taskName="Đổ bê tông lót"
        onClose={handleClose}
        onConfirm={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Hủy / Chọn đội khác'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  // S-25 NFR: khoảng bị chồng hiển thị rõ dạng DD/MM/YYYY
  it('shows the overlapping interval as DD/MM/YYYY', () => {
    render(
      <OverloadWarningDialog
        isOpen={true}
        warning={sampleWarning}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText(/Từ 15\/10\/2026 đến 18\/10\/2026/)).toBeInTheDocument();
  });

  // S-25 AC: việc đã được lưu → pop-up chỉ thông báo, không hỏi giao lại
  it('alreadyAssigned mode shows only "Đã hiểu" which calls onClose', () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();
    render(
      <OverloadWarningDialog
        isOpen={true}
        alreadyAssigned={true}
        warning={sampleWarning}
        teamName="Đội Xây dựng 1"
        taskName="Đổ bê tông lót"
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    );

    expect(screen.getByText(/và đội đang bị/)).toBeInTheDocument();
    expect(screen.queryByText('Tôi đã hiểu, vẫn giao việc')).toBeNull();
    expect(screen.queryByText('Hủy / Chọn đội khác')).toBeNull();

    fireEvent.click(screen.getByText('Đã hiểu'));
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(handleConfirm).not.toHaveBeenCalled();
  });
});
