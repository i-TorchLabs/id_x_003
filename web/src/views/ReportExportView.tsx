"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  CheckboxGroup,
  Input,
  Label,
  Pagination,
  Spinner,
  TextField,
} from "@heroui/react";
import qs from "qs";
import {
  adminActivityNameListApi,
  type AdminActivityNameListRes,
} from "@/api/admin";
import { adminActivityExport } from "@/api/url";
import { SITE_URL } from "@/utils/config";
import { download } from "@/utils/download";
import QueryManagement, {
  type QueryManagementRef,
} from "@/components/aa/QueryManagement";

const PAGE_SIZE = 100;

/** datetime-local 值 (yyyy-MM-ddTHH:mm) -> 源码格式 (yyyy-MM-dd HH:mm) */
const formatDateTime = (v: string | undefined) =>
  v ? v.replace("T", " ") : undefined;

export default function ReportExportView() {
  const [formValue, setFormValue] = useState<{
    start_date?: string;
    end_date?: string;
    fuzzy_name?: string;
  }>({
    start_date: undefined,
    end_date: undefined,
    fuzzy_name: undefined,
  });

  const [selectAllState, setSelectAllState] = useState(false);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const queryManagementRef = useRef<QueryManagementRef>(null);

  const [nameIds, setNameIds] = useState<string[]>([]);
  const [nameList, setNameList] = useState<AdminActivityNameListRes[]>([]);

  const [page, setPage] = useState(1);
  const [itemCount, setItemCount] = useState(0);

  const handleSearchClick = () => {
    queryManagementRef.current?.getData({
      start_time: formatDateTime(formValue.start_date),
      end_time: formatDateTime(formValue.end_date),
      title: nameIds,
    });
  };

  const handleSelectAllToggle = () => {
    const state = !selectAllState;
    setSelectAllState(state);
    if (!state) setNameIds([]);
    else setNameIds(nameList.map((item) => item.activity_name));
  };

  const handleExportClick = () => {
    setExporting(true);
    download(
      `${SITE_URL}/b/sme/aa/enlist${adminActivityExport}?` +
        qs.stringify({
          activity_list: JSON.stringify(nameIds),
          start_time: formatDateTime(formValue.start_date),
          end_time: formatDateTime(formValue.end_date),
        })
    );
    setTimeout(() => {
      setExporting(false);
    }, 3000);
  };

  const getData = useCallback(
    async (p: number) => {
      console.log("nameIds:", nameIds);
      setLoading(true);
      const res = await adminActivityNameListApi({
        start_time: formatDateTime(formValue.start_date),
        end_time: formatDateTime(formValue.end_date),
        title: nameIds,
        offset: p.toString(),
        limit: PAGE_SIZE.toString(),
      });
      setLoading(false);
      setNameList(res.detail);
      setItemCount(Number(res.total));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formValue, nameIds]
  );

  useEffect(() => {
    getData(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePageChange = (p: number) => {
    setPage(p);
    getData(p);
  };

  const totalPages = Math.max(1, Math.ceil(itemCount / PAGE_SIZE));

  return (
    <>
      <div className="bg-[#fff] p-5 mb-2 pb-0 flex justify-between">
        <div className="flex flex-wrap items-end gap-4">
          <TextField
            value={formValue.start_date ?? ""}
            onChange={(v) =>
              setFormValue((f) => ({ ...f, start_date: v || undefined }))
            }
          >
            <Label>Start Time</Label>
            <Input type="datetime-local" placeholder="Please Input Start Time" />
          </TextField>
          <TextField
            value={formValue.end_date ?? ""}
            onChange={(v) =>
              setFormValue((f) => ({ ...f, end_date: v || undefined }))
            }
          >
            <Label>End Time</Label>
            <Input type="datetime-local" placeholder="Please Input End Time" />
          </TextField>
          <Button type="button" onPress={handleSearchClick}>
            Search
          </Button>
          <Button
            variant={!selectAllState ? "secondary" : "tertiary"}
            type="button"
            onPress={handleSelectAllToggle}
          >
            {!selectAllState ? "Select All" : "Unselect All"}
          </Button>
        </div>
        <Button
          variant="primary"
          isPending={exporting}
          onPress={handleExportClick}
        >
          {exporting ? "导出中..." : "Export"}
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center p-4">
          <Spinner size="md" color="accent" aria-label="loading" />
        </div>
      ) : (
        <Card>
          <Card.Content>
            <CheckboxGroup aria-label="activity names" value={nameIds} onChange={setNameIds}>
              <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                {nameList.map((item) => (
                  <Checkbox
                    key={item.activity_name}
                    value={item.activity_name}
                  >
                    {item.activity_name}
                  </Checkbox>
                ))}
              </div>
            </CheckboxGroup>
            <div className="flex justify-end mt-2">
              <Pagination aria-label="pagination">
                <Pagination.Summary>
                  {page} / {totalPages} (Total: {itemCount})
                </Pagination.Summary>
                <Pagination.Content>
                  <Pagination.Item>
                    <Pagination.Previous
                      isDisabled={page <= 1}
                      onPress={() => handlePageChange(page - 1)}
                    >
                      <Pagination.PreviousIcon />
                    </Pagination.Previous>
                  </Pagination.Item>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (n) => (
                      <Pagination.Item key={n}>
                        <Pagination.Link
                          isActive={n === page}
                          onPress={() => handlePageChange(n)}
                        >
                          {n}
                        </Pagination.Link>
                      </Pagination.Item>
                    )
                  )}
                  <Pagination.Item>
                    <Pagination.Next
                      isDisabled={page >= totalPages}
                      onPress={() => handlePageChange(page + 1)}
                    >
                      <Pagination.NextIcon />
                    </Pagination.Next>
                  </Pagination.Item>
                </Pagination.Content>
              </Pagination>
            </div>
          </Card.Content>
        </Card>
      )}
      <QueryManagement ref={queryManagementRef} titleArray={nameIds} />
    </>
  );
}
