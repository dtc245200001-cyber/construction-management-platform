import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import api from "../lib/api";

import {
  BriefcaseBusiness,
  CheckCircle2,
  HardHat,
  Lock,
  LockOpen,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Users,
  UserPlus,
  X,
} from "lucide-react";

const roleLabels = {
  chu_dau_tu: "Chủ đầu tư",
  ban_quan_ly: "Ban quản lý",
  ky_su_giam_sat: "Kỹ sư giám sát",
  chi_huy_truong: "Chỉ huy trưởng",
  doi_truong: "Đội trưởng thi công",
  ke_toan: "Kế toán",
};

function getErrorMessage(
  error,
  fallback
) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    fallback
  );
}

export default function MembersPage({
  user,
}) {
  const currentProjectId =
    localStorage.getItem(
      "currentProjectId"
    );

  // ==========================================================
  // MEMBERS / INVITATIONS
  // ==========================================================

  const [members, setMembers] =
    useState([]);

  const [
    invitations,
    setInvitations,
  ] = useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [
    showInviteModal,
    setShowInviteModal,
  ] = useState(false);

  const [
    inviteData,
    setInviteData,
  ] = useState({
    email: "",
    role: "doi_truong",
  });

  const [
    inviteError,
    setInviteError,
  ] = useState("");

  const [
    inviteSuccess,
    setInviteSuccess,
  ] = useState("");

  const [
    resendingId,
    setResendingId,
  ] = useState(null);

  // ==========================================================
  // TEAMS
  // ==========================================================

  const [teams, setTeams] =
    useState([]);

  const [
    selectedTeamId,
    setSelectedTeamId,
  ] = useState("");

  const [
    selectedTeamMembers,
    setSelectedTeamMembers,
  ] = useState([]);

  const [
    assignedTasks,
    setAssignedTasks,
  ] = useState([]);

  const [
    teamName,
    setTeamName,
  ] = useState("");

  const [
    memberToAdd,
    setMemberToAdd,
  ] = useState("");

  const [
    teamLoading,
    setTeamLoading,
  ] = useState(false);

  const [
    teamNotice,
    setTeamNotice,
  ] = useState(null);

  // ==========================================================
  // TASK ASSIGNMENT / QUANTITY PLAN
  // ==========================================================

  const [tasks, setTasks] =
    useState([]);

  const [
    selectedTaskId,
    setSelectedTaskId,
  ] = useState("");

  const [
    plannedQuantity,
    setPlannedQuantity,
  ] = useState("");

  const [
    quantityUnit,
    setQuantityUnit,
  ] = useState("m3");

  const [
    assigning,
    setAssigning,
  ] = useState(false);

  // ==========================================================
  // ROLE PERMISSIONS
  // ==========================================================

  const canInvite =
    user?.role === "ban_quan_ly" ||
    user?.role === "chu_dau_tu";

  const canManageTeams =
    user?.role === "chu_dau_tu" ||
    user?.role === "ban_quan_ly" ||
    user?.role === "chi_huy_truong";

  // S-25 NFR:
  // chỉ Chỉ huy trưởng được giao việc.
  const canAssign =
    user?.role === "chi_huy_truong";

  // ==========================================================
  // LOAD DATA
  // ==========================================================

  const fetchMembers = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await api.get(
        `/projects/${currentProjectId}/members`
      );

      setMembers(
        res.data.members || []
      );

      setInvitations(
        res.data.invitations || []
      );
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          "Không thể tải danh sách thành viên"
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    if (!currentProjectId) {
      return;
    }

    try {
      const res = await api.get(
        `/projects/${currentProjectId}/teams`
      );

      const rows =
        res.data?.teams || [];

      setTeams(rows);

      setSelectedTeamId(
        (current) => {
          if (
            current &&
            rows.some(
              (team) =>
                String(team.id) ===
                String(current)
            )
          ) {
            return current;
          }

          return "";
        }
      );
    } catch (err) {
      setTeamNotice({
        type: "error",
        message: getErrorMessage(
          err,
          "Không thể tải danh sách đội"
        ),
      });
    }
  };

  const fetchTasks = async () => {
    if (!currentProjectId) {
      return;
    }

    try {
      const res = await api.get(
        `/categories/${currentProjectId}/tree/all`
      );

      const rows = Array.isArray(
        res.data
      )
        ? res.data
        : [];

      setTasks(
        rows
          .filter(
            (item) =>
              item.type === "task" &&
              item.task_id
          )
          .sort((a, b) => {
            const aDate =
              a.start_date || "";

            const bDate =
              b.start_date || "";

            if (aDate !== bDate) {
              return aDate.localeCompare(
                bDate
              );
            }

            return (
              Number(a.task_id) -
              Number(b.task_id)
            );
          })
      );
    } catch (err) {
      setTeamNotice({
        type: "error",
        message: getErrorMessage(
          err,
          "Không thể tải công việc của dự án"
        ),
      });
    }
  };

  const fetchSelectedTeam = async (
    teamId
  ) => {
    if (
      !currentProjectId ||
      !teamId
    ) {
      setSelectedTeamMembers([]);
      setAssignedTasks([]);
      return;
    }

    try {
      setTeamLoading(true);

      const [
        membersRes,
        tasksRes,
      ] = await Promise.all([
        api.get(
          `/projects/${currentProjectId}/teams/${teamId}/members`
        ),

        api.get(
          `/projects/${currentProjectId}/teams/${teamId}/tasks`
        ),
      ]);

      setSelectedTeamMembers(
        membersRes.data?.members || []
      );

      setAssignedTasks(
        tasksRes.data?.tasks || []
      );
    } catch (err) {
      setTeamNotice({
        type: "error",
        message: getErrorMessage(
          err,
          "Không thể tải thông tin đội"
        ),
      });
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    if (!currentProjectId) {
      return;
    }

    fetchMembers();
    fetchTeams();
    fetchTasks();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId]);

  useEffect(() => {
    fetchSelectedTeam(
      selectedTeamId
    );

    setMemberToAdd("");
    setSelectedTaskId("");
    setPlannedQuantity("");

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  // ==========================================================
  // MEMBERS
  // ==========================================================

  const handleInvite = async (e) => {
    e.preventDefault();

    setInviteError("");
    setInviteSuccess("");

    try {
      await api.post(
        `/projects/${currentProjectId}/members`,
        inviteData
      );

      setInviteSuccess(
        "Đã mời thành viên thành công!"
      );

      setInviteData({
        email: "",
        role: "doi_truong",
      });

      await fetchMembers();

      setTimeout(() => {
        setShowInviteModal(false);
      }, 1200);
    } catch (err) {
      setInviteError(
        getErrorMessage(
          err,
          "Lỗi khi mời thành viên"
        )
      );
    }
  };

  const handleResend = async (
    invitationId
  ) => {
    setResendingId(
      invitationId
    );

    try {
      await api.post(
        `/projects/${currentProjectId}/invitations/${invitationId}/resend`
      );

      setInviteSuccess(
        "Đã gửi lại thư mời thành công!"
      );

      await fetchMembers();
    } catch (err) {
      setInviteError(
        getErrorMessage(
          err,
          "Lỗi khi gửi lại thư mời"
        )
      );
    } finally {
      setResendingId(null);
    }
  };

  const handleUnlock = async (
    memberId
  ) => {
    try {
      await api.post(
        `/projects/${currentProjectId}/members/${memberId}/unlock`
      );

      await fetchMembers();
    } catch (err) {
      window.alert(
        getErrorMessage(
          err,
          "Lỗi khi mở khóa tài khoản"
        )
      );
    }
  };

  // ==========================================================
  // TEAM MANAGEMENT
  // ==========================================================

  const handleCreateTeam = async (
    e
  ) => {
    e.preventDefault();

    const name =
      teamName.trim();

    if (!name) {
      setTeamNotice({
        type: "error",
        message:
          "Vui lòng nhập tên đội.",
      });

      return;
    }

    try {
      setTeamLoading(true);
      setTeamNotice(null);

      const res = await api.post(
        `/projects/${currentProjectId}/teams`,
        {
          name,
        }
      );

      setTeamName("");

      setTeamNotice({
        type: "success",
        message:
          "Đã tạo đội thi công.",
      });

      await fetchTeams();

      if (res.data?.team?.id) {
        setSelectedTeamId(
          String(
            res.data.team.id
          )
        );
      }
    } catch (err) {
      setTeamNotice({
        type: "error",
        message: getErrorMessage(
          err,
          "Không thể tạo đội"
        ),
      });
    } finally {
      setTeamLoading(false);
    }
  };

  const handleAddMemberToTeam =
    async () => {
      if (
        !selectedTeamId ||
        !memberToAdd
      ) {
        setTeamNotice({
          type: "error",
          message:
            "Hãy chọn đội và Đội trưởng.",
        });

        return;
      }

      try {
        setTeamLoading(true);
        setTeamNotice(null);

        await api.post(
          `/projects/${currentProjectId}/teams/${selectedTeamId}/members`,
          {
            user_id: Number(
              memberToAdd
            ),
          }
        );

        setMemberToAdd("");

        setTeamNotice({
          type: "success",
          message:
            "Đã thêm Đội trưởng vào đội.",
        });

        await Promise.all([
          fetchSelectedTeam(
            selectedTeamId
          ),
          fetchTeams(),
        ]);
      } catch (err) {
        setTeamNotice({
          type: "error",
          message: getErrorMessage(
            err,
            "Không thể thêm người vào đội"
          ),
        });
      } finally {
        setTeamLoading(false);
      }
    };

  // ==========================================================
  // PLAN + ASSIGN
  // ==========================================================

  const handleAssignTask = async (
    e
  ) => {
    e.preventDefault();

    if (!selectedTeamId) {
      setTeamNotice({
        type: "error",
        message:
          "Vui lòng chọn đội nhận việc.",
      });

      return;
    }

    if (!selectedTaskId) {
      setTeamNotice({
        type: "error",
        message:
          "Vui lòng chọn công việc.",
      });

      return;
    }

    const raw =
      plannedQuantity.trim();

    const quantity =
      Number(raw);

    if (
      raw === "" ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > 9999999999.99
    ) {
      setTeamNotice({
        type: "error",
        message:
          "Khối lượng kế hoạch phải lớn hơn 0 và không vượt giới hạn cho phép.",
      });

      return;
    }

    const unit =
      quantityUnit.trim();

    if (
      !unit ||
      unit.length > 30
    ) {
      setTeamNotice({
        type: "error",
        message:
          "Đơn vị khối lượng không hợp lệ.",
      });

      return;
    }

    try {
      setAssigning(true);
      setTeamNotice(null);

      // 1. Đặt khối lượng kế hoạch.
      await api.patch(
        `/projects/${currentProjectId}/tasks/${selectedTaskId}/quantity-plan`,
        {
          planned_quantity: raw,
          quantity_unit: unit,
        }
      );

      // 2. Giao công việc cho đội.
      await api.post(
        `/projects/${currentProjectId}/tasks/${selectedTaskId}/assignment`,
        {
          team_id: Number(
            selectedTeamId
          ),
        }
      );

      setTeamNotice({
        type: "success",
        message:
          "Đã đặt khối lượng kế hoạch và giao công việc cho đội.",
      });

      setSelectedTaskId("");
      setPlannedQuantity("");

      await fetchSelectedTeam(
        selectedTeamId
      );
    } catch (err) {
      setTeamNotice({
        type: "error",
        message: getErrorMessage(
          err,
          "Không thể giao công việc"
        ),
      });
    } finally {
      setAssigning(false);
    }
  };

  // ==========================================================
  // DERIVED DATA
  // ==========================================================

  const filteredMembers =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      if (!keyword) {
        return members;
      }

      return members.filter(
        (member) =>
          String(
            member.name || ""
          )
            .toLowerCase()
            .includes(keyword) ||
          String(
            member.email || ""
          )
            .toLowerCase()
            .includes(keyword)
      );
    }, [members, search]);

  const teamLeaderCandidates =
    useMemo(() => {
      const memberIds =
        new Set(
          selectedTeamMembers.map(
            (item) =>
              Number(item.user_id)
          )
        );

      return members.filter(
        (member) =>
          member.role ===
            "doi_truong" &&
          !memberIds.has(
            Number(member.id)
          )
      );
    }, [
      members,
      selectedTeamMembers,
    ]);

  const selectedTask =
    tasks.find(
      (item) =>
        String(item.task_id) ===
        String(selectedTaskId)
    );

  const selectedAssignedTask =
    assignedTasks.find(
      (item) =>
        String(item.task_id) ===
        String(selectedTaskId)
    );

  const isLocked = (member) =>
    member.locked_until &&
    new Date(
      member.locked_until
    ) > new Date();

  const hasFailedAttempts = (
    member
  ) =>
    Number(
      member.failed_login_attempts ||
        0
    ) > 0;

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto p-4 md:p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-site-dark">
            <Users className="size-6 text-site-primary" />

            Thành viên & Tổ đội
          </h2>

          <p className="mt-1 text-sm text-site-baseline">
            Quản lý thành viên,
            tổ đội và phân công thi
            công trong dự án.
          </p>
        </div>

        {canInvite && (
          <button
            type="button"
            onClick={() => {
              setShowInviteModal(true);
              setInviteSuccess("");
              setInviteError("");
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-site-primary px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-site-primary/90"
          >
            <Plus className="size-4" />
            Mời thành viên
          </button>
        )}
      </div>

      {/* =====================================================
          TEAM MANAGEMENT
      ===================================================== */}

      {canManageTeams && (
        <section className="mb-8 overflow-hidden rounded-2xl border border-site-border bg-site-surface shadow-sm">
          <div className="border-b border-site-border p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <HardHat className="size-5" />
              </div>

              <div>
                <h3 className="font-bold text-site-dark">
                  Quản lý tổ đội thi
                  công
                </h3>

                <p className="mt-1 text-sm text-site-baseline">
                  Tạo đội, thêm Đội
                  trưởng và quản lý
                  công việc được giao.
                </p>
              </div>
            </div>
          </div>

          {teamNotice && (
            <div
              className={`mx-5 mt-5 rounded-xl border p-3 text-sm font-medium ${
                teamNotice.type ===
                "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {teamNotice.message}
            </div>
          )}

          <div className="grid gap-6 p-5 lg:grid-cols-2">
            {/* CREATE + SELECT TEAM */}
            <div className="space-y-5">
              <div>
                <h4 className="mb-3 font-semibold text-site-dark">
                  1. Tạo đội thi công
                </h4>

                <form
                  onSubmit={
                    handleCreateTeam
                  }
                  className="flex gap-2"
                >
                  <input
                    value={teamName}
                    onChange={(e) =>
                      setTeamName(
                        e.target.value
                      )
                    }
                    maxLength={100}
                    placeholder="VD: Đội thi công 1"
                    className="min-h-11 min-w-0 flex-1 rounded-xl border border-site-border bg-white px-3 text-sm outline-none focus:border-site-primary"
                  />

                  <button
                    type="submit"
                    disabled={teamLoading}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-site-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Plus className="size-4" />
                    Tạo đội
                  </button>
                </form>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-site-dark">
                  Đội đang quản lý
                </label>

                <div className="flex gap-2">
                  <select
                    value={
                      selectedTeamId
                    }
                    onChange={(e) =>
                      setSelectedTeamId(
                        e.target.value
                      )
                    }
                    className="min-h-11 min-w-0 flex-1 rounded-xl border border-site-border bg-white px-3 text-sm outline-none focus:border-site-primary"
                  >
                    <option value="">
                      -- Chọn đội --
                    </option>

                    {teams.map(
                      (team) => (
                        <option
                          key={team.id}
                          value={team.id}
                        >
                          {team.name} (
                          {team.member_count ||
                            0}{" "}
                          người)
                        </option>
                      )
                    )}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      fetchTeams();

                      if (
                        selectedTeamId
                      ) {
                        fetchSelectedTeam(
                          selectedTeamId
                        );
                      }
                    }}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-site-border bg-white text-site-baseline"
                    title="Tải lại"
                  >
                    <RefreshCw className="size-4" />
                  </button>
                </div>
              </div>

              {selectedTeamId && (
                <div className="rounded-xl border border-site-border bg-site-bg/40 p-4">
                  <h4 className="mb-3 font-semibold text-site-dark">
                    2. Thêm Đội trưởng
                    vào đội
                  </h4>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      value={
                        memberToAdd
                      }
                      onChange={(e) =>
                        setMemberToAdd(
                          e.target.value
                        )
                      }
                      className="min-h-11 min-w-0 flex-1 rounded-xl border border-site-border bg-white px-3 text-sm"
                    >
                      <option value="">
                        -- Chọn Đội
                        trưởng --
                      </option>

                      {teamLeaderCandidates.map(
                        (member) => (
                          <option
                            key={
                              member.id
                            }
                            value={
                              member.id
                            }
                          >
                            {member.name} -{" "}
                            {
                              member.email
                            }
                          </option>
                        )
                      )}
                    </select>

                    <button
                      type="button"
                      onClick={
                        handleAddMemberToTeam
                      }
                      disabled={
                        teamLoading ||
                        !memberToAdd
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <UserPlus className="size-4" />
                      Thêm vào đội
                    </button>
                  </div>

                  {teamLeaderCandidates.length ===
                    0 && (
                    <p className="mt-2 text-xs text-site-baseline">
                      Không còn tài
                      khoản Đội trưởng
                      phù hợp. Nếu chưa
                      có, hãy mời thành
                      viên với vai trò
                      Đội trưởng trước.
                    </p>
                  )}

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-baseline">
                      Thành viên của đội
                    </p>

                    {teamLoading ? (
                      <p className="text-sm text-site-baseline">
                        Đang tải...
                      </p>
                    ) : selectedTeamMembers.length ===
                      0 ? (
                      <p className="text-sm text-site-baseline">
                        Đội chưa có thành
                        viên.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {selectedTeamMembers.map(
                          (member) => (
                            <div
                              key={
                                member.user_id
                              }
                              className="flex items-center justify-between rounded-lg border border-site-border bg-white px-3 py-2"
                            >
                              <div>
                                <p className="text-sm font-semibold text-site-dark">
                                  {
                                    member.name
                                  }
                                </p>

                                <p className="text-xs text-site-baseline">
                                  {
                                    member.email
                                  }
                                </p>
                              </div>

                              <CheckCircle2 className="size-4 text-emerald-600" />
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* TASK ASSIGNMENT */}
            <div>
              <div className="rounded-xl border border-site-border bg-site-bg/40 p-4">
                <div className="mb-4 flex items-start gap-3">
                  <BriefcaseBusiness className="mt-0.5 size-5 text-site-primary" />

                  <div>
                    <h4 className="font-semibold text-site-dark">
                      3. Khối lượng kế
                      hoạch & giao việc
                    </h4>

                    <p className="mt-1 text-xs text-site-baseline">
                      Theo S-25, chỉ Chỉ
                      huy trưởng được
                      thực hiện bước này.
                    </p>
                  </div>
                </div>

                {!canAssign ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Tài khoản hiện tại
                    có thể quản lý đội,
                    nhưng không có quyền
                    giao việc. Hãy đăng
                    nhập bằng tài khoản
                    <strong>
                      {" "}
                      Chỉ huy trưởng
                    </strong>{" "}
                    để phân công.
                  </div>
                ) : !selectedTeamId ? (
                  <div className="rounded-xl border border-dashed border-site-border p-6 text-center text-sm text-site-baseline">
                    Hãy chọn đội ở bên
                    trái trước.
                  </div>
                ) : (
                  <form
                    onSubmit={
                      handleAssignTask
                    }
                    className="space-y-4"
                  >
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-site-dark">
                        Công việc
                      </label>

                      <select
                        value={
                          selectedTaskId
                        }
                        onChange={(
                          e
                        ) => {
                          const value =
                            e.target
                              .value;

                          setSelectedTaskId(
                            value
                          );

                          const current =
                            assignedTasks.find(
                              (
                                task
                              ) =>
                                String(
                                  task.task_id
                                ) ===
                                String(
                                  value
                                )
                            );

                          if (current) {
                            setPlannedQuantity(
                              current.planned_quantity ??
                                ""
                            );

                            setQuantityUnit(
                              current.quantity_unit ||
                                "m3"
                            );
                          } else {
                            setPlannedQuantity(
                              ""
                            );
                          }
                        }}
                        className="min-h-11 w-full rounded-xl border border-site-border bg-white px-3 text-sm"
                      >
                        <option value="">
                          -- Chọn công
                          việc --
                        </option>

                        {tasks.map(
                          (task) => {
                            const assigned =
                              assignedTasks.some(
                                (
                                  item
                                ) =>
                                  String(
                                    item.task_id
                                  ) ===
                                  String(
                                    task.task_id
                                  )
                              );

                            return (
                              <option
                                key={
                                  task.task_id
                                }
                                value={
                                  task.task_id
                                }
                              >
                                {
                                  task.name
                                }
                                {task.is_critical
                                  ? " [GĂNG]"
                                  : ""}
                                {assigned
                                  ? " [ĐÃ GIAO ĐỘI NÀY]"
                                  : ""}
                              </option>
                            );
                          }
                        )}
                      </select>

                      {selectedTask && (
                        <p className="mt-1 text-xs text-site-baseline">
                          Trạng thái:{" "}
                          {selectedTask.status ||
                            "Chưa xác định"}
                          {selectedTask.start_date
                            ? ` • Bắt đầu: ${new Date(
                                selectedTask.start_date
                              ).toLocaleDateString(
                                "vi-VN"
                              )}`
                            : ""}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-site-dark">
                          Khối lượng kế
                          hoạch
                        </label>

                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          max="9999999999.99"
                          step="0.01"
                          value={
                            plannedQuantity
                          }
                          onChange={(e) =>
                            setPlannedQuantity(
                              e.target
                                .value
                            )
                          }
                          placeholder="VD: 100"
                          className="min-h-11 w-full rounded-xl border border-site-border bg-white px-3 text-sm"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-site-dark">
                          Đơn vị
                        </label>

                        <input
                          value={
                            quantityUnit
                          }
                          onChange={(e) =>
                            setQuantityUnit(
                              e.target
                                .value
                            )
                          }
                          maxLength={30}
                          placeholder="m3, m2, kg..."
                          className="min-h-11 w-full rounded-xl border border-site-border bg-white px-3 text-sm"
                        />
                      </div>
                    </div>

                    {selectedAssignedTask && (
                      <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
                        Công việc này
                        hiện đã được giao
                        cho đội đang chọn.
                        Lưu lại sẽ cập
                        nhật khối lượng
                        kế hoạch và phân
                        công.
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={
                        assigning
                      }
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-site-primary px-4 font-semibold text-white disabled:opacity-50"
                    >
                      {assigning
                        ? "Đang lưu..."
                        : "Lưu kế hoạch & giao việc"}
                    </button>
                  </form>
                )}

                {selectedTeamId && (
                  <div className="mt-5 border-t border-site-border pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-baseline">
                      Công việc hiện được
                      giao cho đội
                    </p>

                    {assignedTasks.length ===
                    0 ? (
                      <p className="text-sm text-site-baseline">
                        Chưa có công việc
                        nào.
                      </p>
                    ) : (
                      <div className="max-h-52 space-y-2 overflow-y-auto">
                        {assignedTasks.map(
                          (task) => (
                            <div
                              key={
                                task.task_id
                              }
                              className="rounded-lg border border-site-border bg-white p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-site-dark">
                                    {
                                      task.name
                                    }
                                  </p>

                                  <p className="mt-0.5 text-xs text-site-baseline">
                                    {
                                      task.work_item_name
                                    }
                                  </p>
                                </div>

                                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                                  {task.planned_quantity ??
                                    "Chưa đặt"}{" "}
                                  {task.quantity_unit ||
                                    ""}
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================
          MEMBERS TABLE
      ===================================================== */}

      {loading ? (
        <div className="h-[400px] animate-pulse rounded-2xl border border-site-border bg-site-surface" />
      ) : error ? (
        <div className="rounded-xl bg-site-critical/10 p-4 text-center font-medium text-site-critical">
          {error}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-site-border bg-site-surface shadow-sm">
          <div className="flex flex-col gap-3 border-b border-site-border p-4 sm:flex-row sm:items-center">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-site-baseline" />

              <input
                type="text"
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
                placeholder="Tìm kiếm theo tên hoặc email..."
                className="w-full rounded-lg border border-site-border bg-site-bg py-2 pl-9 pr-4 text-sm outline-none transition-colors focus:border-site-primary"
              />
            </div>

            <div className="text-sm font-medium text-site-baseline">
              Tổng cộng:{" "}
              <span className="text-site-dark">
                {members.length +
                  invitations.length}
              </span>{" "}
              người
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-site-border bg-site-bg/50 font-semibold text-site-baseline">
                <tr>
                  <th className="px-6 py-4">
                    Thành viên
                  </th>

                  <th className="px-6 py-4">
                    Vai trò
                  </th>

                  <th className="px-6 py-4 text-right">
                    Trạng thái
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-site-border">
                {filteredMembers.map(
                  (member) => {
                    const locked =
                      isLocked(
                        member
                      );

                    return (
                      <tr
                        key={member.id}
                        className={
                          locked
                            ? "bg-site-critical/5"
                            : ""
                        }
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex size-9 shrink-0 items-center justify-center rounded-full font-bold ${
                                locked
                                  ? "bg-site-critical/10 text-site-critical"
                                  : "bg-site-primary/10 text-site-primary"
                              }`}
                            >
                              {locked ? (
                                <Lock className="size-4" />
                              ) : (
                                String(
                                  member.name ||
                                    "?"
                                )
                                  .substring(
                                    0,
                                    2
                                  )
                                  .toUpperCase()
                              )}
                            </div>

                            <div>
                              <p className="font-semibold text-site-dark">
                                {
                                  member.name
                                }
                              </p>

                              <p className="mt-0.5 flex items-center gap-1 text-xs text-site-baseline">
                                <Mail className="size-3" />
                                {
                                  member.email
                                }
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 font-medium text-site-dark">
                            <Shield className="size-4 text-site-baseline" />

                            {roleLabels[
                              member.role
                            ] ||
                              member.role}
                          </div>
                        </td>

                        <td className="px-6 py-4 text-right">
                          {locked ? (
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-site-critical/10 px-2.5 py-1 text-xs font-medium text-site-critical">
                                <Lock className="size-3" />
                                Đang bị khóa
                              </span>

                              {canInvite && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUnlock(
                                      member.id
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-full bg-site-primary/10 px-2.5 py-1 text-xs font-medium text-site-primary"
                                >
                                  <LockOpen className="size-3" />
                                  Mở khóa
                                </button>
                              )}
                            </div>
                          ) : hasFailedAttempts(
                              member
                            ) ? (
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                                Sai{" "}
                                {
                                  member.failed_login_attempts
                                }
                                /5 lần
                              </span>

                              {canInvite && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUnlock(
                                      member.id
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded-full bg-site-primary/10 px-2.5 py-1 text-xs font-medium text-site-primary"
                                >
                                  <LockOpen className="size-3" />
                                  Reset
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-site-success/10 px-2.5 py-1 text-xs font-medium text-site-success">
                              <span className="size-1.5 rounded-full bg-current" />
                              Đã tham gia
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }
                )}

                {invitations.map(
                  (inv) => (
                    <tr
                      key={`inv-${inv.id}`}
                      className="border-l-4 border-site-alert opacity-75"
                    >
                      <td className="px-6 py-4">
                        <p className="font-semibold italic text-site-dark">
                          Chưa đăng ký
                        </p>

                        <p className="text-xs text-site-baseline">
                          {inv.email}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        {roleLabels[
                          inv.role
                        ] || inv.role}
                      </td>

                      <td className="px-6 py-4 text-right">
                        {canInvite && (
                          <button
                            type="button"
                            onClick={() =>
                              handleResend(
                                inv.id
                              )
                            }
                            disabled={
                              resendingId ===
                              inv.id
                            }
                            className="rounded-lg bg-site-primary/10 px-3 py-1.5 text-xs font-semibold text-site-primary disabled:opacity-50"
                          >
                            {resendingId ===
                            inv.id
                              ? "Đang gửi..."
                              : "Gửi lại"}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                )}

                {filteredMembers.length ===
                  0 &&
                  invitations.length ===
                    0 && (
                    <tr>
                      <td
                        colSpan="3"
                        className="px-6 py-12 text-center text-site-baseline"
                      >
                        Chưa có thành
                        viên nào trong
                        dự án.
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================
          INVITE MODAL
      ===================================================== */}

      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-site-dark/50 p-4">
          <form
            onSubmit={handleInvite}
            className="w-full max-w-md overflow-hidden rounded-2xl bg-site-surface shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-site-border px-6 py-4">
              <h3 className="text-lg font-bold">
                Mời thành viên mới
              </h3>

              <button
                type="button"
                onClick={() =>
                  setShowInviteModal(
                    false
                  )
                }
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              {inviteError && (
                <div className="rounded-lg bg-site-critical/10 p-3 text-sm text-site-critical">
                  {inviteError}
                </div>
              )}

              {inviteSuccess && (
                <div className="rounded-lg bg-site-success/10 p-3 text-sm text-site-success">
                  {inviteSuccess}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Email người dùng *
                </label>

                <input
                  required
                  type="email"
                  value={
                    inviteData.email
                  }
                  onChange={(e) =>
                    setInviteData({
                      ...inviteData,
                      email:
                        e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-site-border bg-site-bg px-3 py-2.5 text-sm"
                  placeholder="VD: nv.a@cong-truong-360.vn"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Vai trò *
                </label>

                <select
                  value={
                    inviteData.role
                  }
                  onChange={(e) =>
                    setInviteData({
                      ...inviteData,
                      role:
                        e.target.value,
                    })
                  }
                  className="w-full rounded-lg border border-site-border bg-site-bg px-3 py-2.5 text-sm"
                >
                  <option value="ban_quan_ly">
                    Ban quản lý
                  </option>

                  <option value="ky_su_giam_sat">
                    Kỹ sư giám sát
                  </option>

                  <option value="chi_huy_truong">
                    Chỉ huy trưởng
                  </option>

                  <option value="doi_truong">
                    Đội trưởng thi công
                  </option>

                  <option value="ke_toan">
                    Kế toán dự án
                  </option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-site-border bg-site-bg/50 px-6 py-4">
              <button
                type="button"
                onClick={() =>
                  setShowInviteModal(
                    false
                  )
                }
                className="px-4 py-2 text-sm font-medium"
              >
                Hủy
              </button>

              <button
                type="submit"
                className="rounded-lg bg-site-primary px-4 py-2 text-sm font-medium text-white"
              >
                Gửi lời mời
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}