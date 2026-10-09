import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { X, Plus, Trash2, Loader2, AlertCircle, RefreshCw, Minus, CloudRain } from 'lucide-react';

// S-22 / T-51 — Form ghi mục đầu ngày
export default function DiaryDayForm({ projectId, date, existing, onClose, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [catalogs, setCatalogs] = useState({ weather_types: [], equipment_types: [] });
  const [globalError, setGlobalError] = useState(null);
  const [conflictData, setConflictData] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [manpower, setManpower] = useState(existing?.manpower_count ?? '');
  const [weatherTypeId, setWeatherTypeId] = useState(existing?.weather_type_id ?? '');
  const [weatherNote, setWeatherNote] = useState(existing?.weather_note || '');
  const [equipment, setEquipment] = useState(existing?.equipment || []);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(existing?.updated_at || null);

  // Field errors
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let isMounted = true;
    api.get(`/projects/${projectId}/diary-catalogs`)
      .then(res => {
        if (isMounted) {
          setCatalogs(res.data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setGlobalError('Không thể tải danh mục. Vui lòng kiểm tra kết nối mạng.');
          setLoading(false);
        }
      });
    return () => { isMounted = false; };
  }, [projectId]);

  const handleAddEquipment = () => {
    setEquipment([...equipment, { equipment_type_id: '', quantity: 1 }]);
  };

  const handleUpdateEquipment = (index, field, value) => {
    const newEq = [...equipment];
    if (field === 'quantity') {
      const val = parseInt(value, 10);
      newEq[index][field] = isNaN(val) ? '' : val;
    } else {
      newEq[index][field] = value;
    }
    setEquipment(newEq);
  };

  const handleQuantityChange = (index, delta) => {
    const newEq = [...equipment];
    const current = parseInt(newEq[index].quantity, 10) || 0;
    const next = Math.max(1, current + delta);
    newEq[index].quantity = next;
    setEquipment(newEq);
  };

  const handleRemoveEquipment = (index) => {
    const newEq = [...equipment];
    newEq.splice(index, 1);
    setEquipment(newEq);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGlobalError(null);
    setConflictData(null);
    const newErrors = {};

    // Validate manpower
    const mp = manpower === '' ? null : Number(manpower);
    if (mp !== null) {
      if (!Number.isInteger(mp)) newErrors.manpower = 'Phải là số nguyên.';
      else if (mp < 0) newErrors.manpower = 'Không được là số âm.';
      else if (mp > 99999) newErrors.manpower = 'Số quá lớn.';
    }

    // Validate weather note
    if (weatherNote && weatherNote.length > 500) {
      newErrors.weatherNote = 'Ghi chú quá dài (tối đa 500 ký tự).';
    }

    // Validate equipment
    const eqIds = new Set();
    const eqList = [];
    let hasEqError = false;

    for (let i = 0; i < equipment.length; i++) {
      const eq = equipment[i];
      if (!eq.equipment_type_id) {
        continue; // Bỏ qua dòng trống
      }
      const eid = parseInt(eq.equipment_type_id, 10);
      const q = parseInt(eq.quantity, 10);

      if (eqIds.has(eid)) {
        newErrors[`eq_${i}`] = 'Thiết bị trùng lặp.';
        hasEqError = true;
      }
      if (isNaN(q) || q < 1 || q > 9999) {
        newErrors[`eq_${i}`] = 'Số lượng phải từ 1 đến 9.999.';
        hasEqError = true;
      }
      eqIds.add(eid);
      eqList.push({ equipment_type_id: eid, quantity: q });
    }

    // Check empty body
    if (mp === null && !weatherTypeId && !weatherNote.trim() && eqList.length === 0) {
      setGlobalError('Vui lòng điền ít nhất một thông tin (nhân lực, thời tiết, hoặc thiết bị).');
      return;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const wt = weatherTypeId === '' ? null : parseInt(weatherTypeId, 10);

    const body = {
      manpower_count: mp,
      weather_type_id: wt,
      weather_note: weatherNote.trim() || null,
      equipment: eqList,
      expected_updated_at: expectedUpdatedAt
    };

    setSaving(true);
    setErrors({});
    try {
      const res = await api.put(`/projects/${projectId}/diary-days/${date}`, body);
      onSuccess(res.data);
    } catch (err) {
      if (!err.response) {
        setGlobalError('Chưa gửi được. Có vẻ bạn đang mất mạng, dữ liệu vẫn được giữ nguyên.');
      } else if (err.response.status === 409 && err.response.data?.day) {
        setGlobalError('Người khác vừa sửa mục đầu ngày này. Vui lòng tải lại dữ liệu mới.');
        setConflictData(err.response.data.day);
      } else if (err.response.status === 403) {
        setGlobalError('Bạn không có quyền ghi nhật ký trong dự án này.');
      } else {
        setGlobalError(err.response.data?.message || 'Có lỗi xảy ra khi lưu.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReloadConflict = () => {
    if (!conflictData) return;
    setManpower(conflictData.manpower_count ?? '');
    setWeatherTypeId(conflictData.weather_type_id ?? '');
    setWeatherNote(conflictData.weather_note || '');
    setEquipment(conflictData.equipment || []);
    setExpectedUpdatedAt(conflictData.updated_at);
    setConflictData(null);
    setGlobalError(null);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl p-6 flex flex-col items-center">
          <Loader2 className="animate-spin text-blue-600 mb-2" size={32} />
          <p className="text-sm text-gray-500">Đang tải...</p>
        </div>
      </div>
    );
  }

  // Danh sách ID thiết bị đã chọn để disable trong select
  const selectedEqIds = equipment.map(e => String(e.equipment_type_id)).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full bg-white rounded-t-2xl sm:rounded-2xl sm:max-w-lg max-h-[90vh] flex flex-col mx-auto shadow-2xl animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:fade-in-0 sm:zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50 shrink-0 rounded-t-2xl">
          <h2 className="font-bold text-gray-800 text-lg">
            {existing ? 'Sửa mục đầu ngày' : 'Ghi mục đầu ngày'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center">
            <X size={24} />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto min-h-0 flex-1 hide-scrollbar">
          {globalError && (
            <div className="mb-5 p-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <span className="leading-relaxed">{globalError}</span>
              </div>
              {conflictData && (
                <button 
                  onClick={handleReloadConflict}
                  className="self-end bg-white border border-red-200 text-red-600 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 shadow-sm hover:bg-red-50 min-h-[44px]"
                >
                  <RefreshCw size={16} /> Tải lại dữ liệu mới
                </button>
              )}
            </div>
          )}

          <form id="diary-day-form" onSubmit={handleSubmit} className="space-y-6">
            
            {/* Nhân lực */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Tổng nhân lực (người)
              </label>
              <input
                type="number"
                value={manpower}
                onChange={e => setManpower(e.target.value)}
                placeholder="Ví dụ: 25 (Cho phép 0)"
                className={`w-full px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 transition-all min-h-[48px] ${errors.manpower ? 'border-red-400 focus:border-red-500 focus:ring-red-200 bg-red-50' : 'border-gray-200 focus:border-blue-500 focus:ring-blue-200 bg-gray-50 hover:bg-gray-100'}`}
              />
              {errors.manpower && <p className="text-red-500 text-xs mt-1.5 font-medium">{errors.manpower}</p>}
            </div>

            {/* Thời tiết */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">Thời tiết chính</label>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {catalogs.weather_types.map(wt => {
                  const isSelected = String(weatherTypeId) === String(wt.id);
                  return (
                    <button
                      key={wt.id}
                      type="button"
                      onClick={() => setWeatherTypeId(wt.id)}
                      className={`
                        min-h-[56px] flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all text-sm font-medium
                        ${isSelected 
                          ? (wt.is_adverse ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-blue-500 bg-blue-50 text-blue-800') 
                          : 'border-gray-100 bg-white text-gray-600 hover:border-gray-300'
                        }
                      `}
                    >
                      <div className="flex items-center gap-1.5">
                        {wt.is_adverse && <CloudRain size={16} className={isSelected ? 'text-orange-500' : 'text-orange-400'} />}
                        <span>{wt.label}</span>
                      </div>
                      {wt.is_adverse && (
                        <span className="text-[10px] mt-0.5 opacity-70">Bất lợi</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
              
            {/* Ghi chú thời tiết */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2 flex justify-between items-end">
                <span>Ghi chú thời tiết</span>
                <span className={`text-xs ${weatherNote.length > 500 ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                  {weatherNote.length}/500
                </span>
              </label>
              <textarea
                value={weatherNote}
                onChange={e => setWeatherNote(e.target.value)}
                placeholder="Ghi chú thêm (Mưa lúc mấy giờ...)"
                rows={2}
                className={`w-full px-4 py-3 rounded-xl border text-base outline-none focus:ring-2 transition-all resize-none ${errors.weatherNote ? 'border-red-400 focus:border-red-500 focus:ring-red-200 bg-red-50' : 'border-gray-200 focus:border-blue-500 focus:ring-blue-200 bg-gray-50 hover:bg-gray-100'}`}
              />
              {errors.weatherNote && <p className="text-red-500 text-xs mt-1.5 font-medium">{errors.weatherNote}</p>}
            </div>

            {/* Thiết bị */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-gray-800">
                  Thiết bị thi công chính
                </label>
                <button
                  type="button"
                  onClick={handleAddEquipment}
                  className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm font-medium px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors min-h-[40px]"
                >
                  <Plus size={16} /> Thêm
                </button>
              </div>
              
              {equipment.length === 0 ? (
                <div className="text-sm text-gray-400 italic text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  Chưa có thiết bị nào. Bấm "Thêm" để chọn.
                </div>
              ) : (
                <div className="space-y-3">
                  {equipment.map((eq, idx) => (
                    <div key={idx} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <select
                          value={eq.equipment_type_id}
                          onChange={e => handleUpdateEquipment(idx, 'equipment_type_id', e.target.value)}
                          className="flex-1 px-3 py-3 rounded-xl border border-gray-200 bg-gray-50 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 min-h-[48px]"
                        >
                          <option value="">-- Chọn máy --</option>
                          {catalogs.equipment_types.map(et => {
                            const isSelectedByOther = selectedEqIds.includes(String(et.id)) && String(eq.equipment_type_id) !== String(et.id);
                            return (
                              <option key={et.id} value={et.id} disabled={isSelectedByOther}>
                                {et.label} {et.unit ? `(${et.unit})` : ''} {isSelectedByOther ? ' (Đã chọn)' : ''}
                              </option>
                            );
                          })}
                        </select>
                        
                        <div className="flex items-center border border-gray-200 rounded-xl bg-gray-50 min-h-[48px]">
                          <button 
                            type="button"
                            onClick={() => handleQuantityChange(idx, -1)}
                            className="p-2 text-gray-500 hover:text-gray-800 min-w-[44px] min-h-[48px] flex items-center justify-center"
                          >
                            <Minus size={18} />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={eq.quantity}
                            onChange={e => handleUpdateEquipment(idx, 'quantity', e.target.value)}
                            className="w-12 text-center text-base font-semibold bg-transparent border-none outline-none p-0"
                          />
                          <button 
                            type="button"
                            onClick={() => handleQuantityChange(idx, 1)}
                            className="p-2 text-gray-500 hover:text-gray-800 min-w-[44px] min-h-[48px] flex items-center justify-center"
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => handleRemoveEquipment(idx)}
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center shrink-0"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                      {errors[`eq_${idx}`] && <p className="text-red-500 text-xs font-medium pl-1">{errors[`eq_${idx}`]}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Pad bottom for mobile scrolling */}
            <div className="h-6"></div>
          </form>
        </div>

        <div className="p-4 border-t border-gray-100 bg-white sm:rounded-b-2xl shrink-0 flex gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-3.5 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 min-h-[48px]"
          >
            Đóng
          </button>
          <button
            type="submit"
            form="diary-day-form"
            disabled={saving}
            className="flex-[2] py-3.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 min-h-[48px]"
          >
            {saving ? <Loader2 className="animate-spin" size={20} /> : null}
            {saving ? 'Đang lưu...' : (existing ? 'Cập nhật' : 'Lưu mục đầu ngày')}
          </button>
        </div>
      </div>
    </div>
  );
}
