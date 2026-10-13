import { getOfflineSnapshot, saveOfflineSnapshot } from "../lib/diaryDb";

export const SNAPSHOT_TYPES = {
  WBS: "wbs",
  CONTRACT_QUANTITIES: "contract-quantities",
  GANTT: "gantt",
  CPM: "cpm",
};

export function isNetworkError(error) {
  // An HTTP response always wins: do not hide 403/404/422/5xx with stale data,
  // even when the browser also reports itself offline.
  if (error?.response) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = String(error?.message || error || "").toLowerCase();
  return ["network", "failed to fetch", "enotfound", "econn", "timeout", "offline", "mạng"].some((part) => message.includes(part));
}

export async function readSnapshot(projectId, type) {
  return getOfflineSnapshot(projectId, type);
}

export async function writeSnapshot(projectId, type, payload) {
  try {
    return await saveOfflineSnapshot(projectId, type, payload);
  } catch (error) {
    console.warn("Không thể lưu snapshot ngoại tuyến:", error?.message || error);
    return null;
  }
}
