"use client";

import {
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";
import { Pagination, Spinner, Table } from "@heroui/react";
import {
  queryDataSearchApi,
  type QueryDataSearchRes,
} from "@/api/admin";

interface QueryManagementProps {
  titleArray?: string[];
}

export interface QueryManagementRef {
  getData: (query?: { title?: string[]; start_time?: string; end_time?: string }) => Promise<void>;
}

const columns = [
  { id: "seq", name: "Seq" },
  { id: "aictivity_name", name: "Aictivity Name" },
  { id: "order", name: "Order" },
  { id: "name", name: "Name" },
  { id: "number", name: "Number" },
  { id: "email", name: "Email" },
  { id: "time", name: "Time" },
  { id: "info_1", name: "Info" },
  // { id: "info_2", name: "Info.2" },
  // { id: "info_3", name: "Info.3" },
  // { id: "info_4", name: "Info.4" },
  // { id: "info_5", name: "Info.5" },
  // { id: "info_6", name: "Info.6" },
  // { id: "info_7", name: "Info.7" },
  // { id: "info_8", name: "Info.8" },
];

const PAGE_SIZE = 20;

const QueryManagement = forwardRef<QueryManagementRef, QueryManagementProps>(
  ({ titleArray = [] }, ref) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<QueryDataSearchRes[]>([]);
    const [page, setPage] = useState(1);
    const [itemCount, setItemCount] = useState(0);

    const getData = async (query?: {
      title?: string[];
      start_time?: string;
      end_time?: string;
    }) => {
      const { title, start_time, end_time } = query || {};
      setLoading(true);
      const res = await queryDataSearchApi({
        title: title ?? titleArray,
        start_time,
        end_time,
        offset: page.toString(),
        limit: PAGE_SIZE.toString(),
      });
      setLoading(false);
      setData(res.result);
      setItemCount(Number(res.total));
    };

    useImperativeHandle(ref, () => ({ getData }));

    const handlePageChange = (p: number) => {
      if (loading) return;
      setPage(p);
      // 与源码一致:页码变化后重新拉取
      setTimeout(() => {
        getData();
      });
    };

    const totalPages = Math.max(1, Math.ceil(itemCount / PAGE_SIZE));

    return (
      <div className="mt-2">
        <Table aria-label="query data">
          <Table.ScrollContainer>
            <Table.Content aria-label="data table">
              <Table.Header columns={columns}>
                {(col) => <Table.Column id={col.id}>{col.name}</Table.Column>}
              </Table.Header>
              <Table.Body
                items={data.map((row, i) => ({ ...row, __rowId: i }))}
                renderEmptyState={() =>
                  loading ? <Spinner size="md" color="accent" aria-label="loading" /> : <div />
                }
              >
                {(row) => (
                  <Table.Row id={row.__rowId}>
                    {(colId) => (
                      <Table.Cell>
                        {String(row[colId as unknown as keyof QueryDataSearchRes] ?? "")}
                      </Table.Cell>
                    )}
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
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
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <Pagination.Item key={n}>
                  <Pagination.Link isActive={n === page} onPress={() => handlePageChange(n)}>
                    {n}
                  </Pagination.Link>
                </Pagination.Item>
              ))}
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
      </div>
    );
  }
);

QueryManagement.displayName = "QueryManagement";

export default QueryManagement;
