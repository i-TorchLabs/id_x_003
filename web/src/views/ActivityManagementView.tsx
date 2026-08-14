"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  Button,
  Chip,
  Form,
  Input,
  Label,
  Modal,
  Pagination,
  Table,
  TextField,
  toast,
} from "@heroui/react";
import { downloadBase64 } from "@/utils/download";
import {
  adminActivityListApi,
  adminActivityUpdateApi,
  adminActivitySearchApi,
  adminActivityCreateApi,
  adminActivityDeleteApi,
  adminActivityDownloadApi,
  adminActivityUploadApi,
  type AdminActivityListRes,
  type AdminActivityUpdateReq,
  type AdminActivityCreateReq,
} from "@/api/admin";
import { useUserStore } from "@/context/UserContext";
import ActivityForm, {
  type ActivityFormRef,
  type ActivityFormValue,
} from "@/components/aa/ActivityForm";

/** datetime-local 值 (yyyy-MM-ddTHH:mm) -> 接口格式 (yyyy-MM-dd HH:mm) */
const dateTimeToStr = (value: string): string | undefined =>
  value ? value.replace("T", " ") : undefined;

/** 与 Report 页面一致的时间选择器(TextField + datetime-local) */
function SearchDatePicker({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField value={value} onChange={onChange} aria-label={label}>
      <div className="flex items-center gap-2">
        <Label className="shrink-0">{label}</Label>
        <Input type="datetime-local" placeholder={placeholder} aria-label={placeholder} />
      </div>
    </TextField>
  );
}

interface ModalState {
  isEdit: boolean;
  activityId: string;
  initialValue?: Partial<ActivityFormValue>;
}

export default function ActivityManagementView() {
  const userStore = useUserStore();

  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [uploadMsg, setUploadMsg] = useState({ success: 0, fail: 0 });
  const [page, setPage] = useState(1);
  const [itemCount, setItemCount] = useState(0);
  const pageSize = 20;
  const [data, setData] = useState<AdminActivityListRes[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalState, setModalState] = useState<ModalState>({
    isEdit: false,
    activityId: "",
  });
  const [deleteTarget, setDeleteTarget] =
    useState<AdminActivityListRes | null>(null);
  const activityFormRef = useRef<ActivityFormRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getData = useCallback(
    async (pageNo = page) => {
      setLoading(true);
      let result: AdminActivityListRes[] = [];
      try {
        const res = await adminActivityListApi({
          user_id: userStore.state.userId,
          offset: pageNo.toString(),
          limit: pageSize.toString(),
          start_date: dateTimeToStr(startDate),
          end_date: dateTimeToStr(endDate),
        });
        result = res.detail;
        setItemCount(Number(res.total));
      } catch {
        toast.danger("Fail to load data.");
      }
      setData(result || []);
      setLoading(false);
    },
    [page, startDate, endDate, userStore.state.userId]
  );

  useEffect(() => {
    getData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchClick = () => {
    getData();
  };

  const handlePageChange = (newPage: number) => {
    if (loading) return;
    setPage(newPage);
    getData(newPage);
  };

  const openModal = async (isEdit = false, activityId = "") => {
    if (isEdit) {
      const activityFormData = await adminActivitySearchApi({
        activity_id: activityId,
      });
      setModalState({
        isEdit,
        activityId,
        initialValue: {
          ...activityFormData,
          apply_start_time: new Date(
            activityFormData.apply_start_time
          ).getTime(),
          apply_end_time: new Date(activityFormData.apply_end_time).getTime(),
          activity_start_time: new Date(
            activityFormData.activity_start_time
          ).getTime(),
          activity_end_time: new Date(
            activityFormData.activity_end_time
          ).getTime(),
        } as Partial<ActivityFormValue>,
      });
    } else {
      setModalState({ isEdit, activityId, initialValue: undefined });
    }
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const formValue = (activityFormRef.current?.formValue || {}) as Record<
      string,
      any
    >;
    const {
      activity_start_time,
      activity_end_time,
      apply_start_time,
      apply_end_time,
    } = formValue;
    if (activity_start_time > activity_end_time) {
      toast.danger(
        '"activity_start_time" later than "activity_end_time" is forbiden!'
      );
      return;
    }
    if (apply_start_time > apply_end_time) {
      toast.danger(
        '"apply_start_time" later than "apply_end_time" is forbiden!'
      );
      return;
    }
    const reqData = {
      ...activityFormRef.current?.formValue,
    } as unknown as AdminActivityCreateReq & { activity_id?: string };
    if (modalState.isEdit) {
      reqData.activity_id = modalState.activityId;
      await adminActivityUpdateApi(reqData as AdminActivityUpdateReq);
    } else {
      await adminActivityCreateApi(reqData as AdminActivityCreateReq);
    }
    setModalOpen(false);
    getData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await adminActivityDeleteApi({
      activity_id: deleteTarget.activity_id,
    });
    getData();
  };

  const uploadFile = async (file: File) => {
    try {
      const res = await adminActivityUploadApi(file);
      setUploadMsg(res);
      setPage(1);
      await getData(1);
    } catch (error) {
      toast.danger((error as Error).message);
    }
  };

  const handleDownloadClick = async () => {
    try {
      const res = await adminActivityDownloadApi();
      downloadBase64(res.fileName, res.fileBase64);
    } catch (error) {
      toast.danger((error as Error).message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(itemCount / pageSize));

  const columns = [
    { id: "project_name", name: "Title" },
    { id: "quota", name: "Offered" },
    { id: "number", name: "Occupied" },
    { id: "activity_start_time", name: "Start Time" },
    { id: "activity_end_time", name: "End Time" },
    { id: "apply_start_time", name: "App Start Time" },
    { id: "apply_end_time", name: "App End Time" },
    { id: "apply_link", name: "Address" },
    { id: "apply_detail", name: "Detail" },
    { id: "actions", name: "Options" },
  ];

  return (
    <div>
      <div className="bg-[#fff] mb-2 pb-5">
        <div className="flex items-center justify-between p-5">
          <Form
            className="flex flex-row flex-wrap items-center gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchClick();
            }}
          >
            <SearchDatePicker
              label="Start Time"
              placeholder="Please Input Start Time"
              value={startDate}
              onChange={setStartDate}
            />
            <SearchDatePicker
              label="End Time"
              placeholder="Please Input End Time"
              value={endDate}
              onChange={setEndDate}
            />
            <Button type="submit" onPress={handleSearchClick}>
              Search
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="primary"
              onPress={() => fileInputRef.current?.click()}
            >
              Upload
            </Button>
            <Button onPress={handleDownloadClick}>Download Template</Button>
          </Form>
          <Button variant="primary" onPress={() => openModal(false)}>
            Add
          </Button>
        </div>
        {!!uploadMsg.success && (
          <Chip color="success" className="ml-5 mt-2">
            Upload Success: {uploadMsg.success}
          </Chip>
        )}
        {!!uploadMsg.fail && (
          <Chip color="danger" className="ml-5 mt-2">
            Upload Fail: {uploadMsg.fail}
          </Chip>
        )}
      </div>

      <Table aria-label="Activity list">
        <Table.ScrollContainer>
          <Table.Content aria-label="data table">
            <Table.Header columns={columns}>
              {(col) => <Table.Column id={col.id} isRowHeader={col.id === columns[0].id}>{col.name}</Table.Column>}
            </Table.Header>
            <Table.Body
              items={data}
              renderEmptyState={() => <div className="p-4">No data</div>}
            >
              {(row) => (
                <Table.Row id={row.activity_id} columns={columns}>
                  {(column: { id: string; name: string }) => {
                    const colKey = column.id;
                    switch (colKey) {
                      case "apply_link":
                        return (
                          <Table.Cell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={() =>
                                window.open(
                                  `/f/aa/user/activity?activity_id=${row.activity_id}`,
                                  "_blank"
                                )
                              }
                            >
                              address
                            </Button>
                          </Table.Cell>
                        );
                      case "apply_detail":
                        return (
                          <Table.Cell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={() =>
                                window.open(
                                  `/f/aa/admin/activity-detail?activity_id=${row.activity_id}`,
                                  "_blank"
                                )
                              }
                            >
                              detail
                            </Button>
                          </Table.Cell>
                        );
                      case "actions":
                        return (
                          <Table.Cell>
                            <Button
                              size="sm"
                              variant="primary"
                              className="mr-2"
                              onPress={() => openModal(true, row.activity_id)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onPress={() => setDeleteTarget(row)}
                            >
                              Delete
                            </Button>
                          </Table.Cell>
                        );
                      default:
                        return (
                          <Table.Cell>
                            {String(
                              row[colKey as keyof AdminActivityListRes] ?? ""
                            )}
                          </Table.Cell>
                        );
                    }
                  }}
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      <div className="flex justify-end p-4 bg-white">
        <Pagination aria-label="pagination">
          <Pagination.Summary>
            {page} / {totalPages}
          </Pagination.Summary>
          <Pagination.Content>
            <Pagination.Item>
              <Pagination.Previous
                onPress={() => handlePageChange(page - 1)}
                isDisabled={page <= 1 || loading}
              >
                <Pagination.PreviousIcon />
              </Pagination.Previous>
            </Pagination.Item>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <Pagination.Item key={n}>
                <Pagination.Link
                  isActive={n === page}
                  onPress={() => handlePageChange(n)}
                >
                  {n}
                </Pagination.Link>
              </Pagination.Item>
            ))}
            <Pagination.Item>
              <Pagination.Next
                onPress={() => handlePageChange(page + 1)}
                isDisabled={page >= totalPages || loading}
              >
                <Pagination.NextIcon />
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      </div>

      <Modal isOpen={modalOpen} onOpenChange={setModalOpen}>
        <Modal.Backdrop>
          <Modal.Container size="md" placement="center">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>
                  {modalState.isEdit ? "Edit" : "添加"}活动信息
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                {modalOpen && (
                  <ActivityForm
                    key={modalState.isEdit ? modalState.activityId : "add"}
                    ref={activityFormRef}
                    initialValue={modalState.initialValue}
                  />
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="ghost" onPress={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onPress={handleSubmit}>
                  Submit
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <AlertDialog
        isOpen={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container placement="center">
            <AlertDialog.Dialog>
              <AlertDialog.Header>
                <AlertDialog.Icon status="warning" />
                <AlertDialog.Heading>Confirm Delete</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                Are you sure you want to delete this activity?
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="ghost" onPress={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onPress={() => {
                    setDeleteTarget(null);
                    handleDelete();
                  }}
                >
                  Delete
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
