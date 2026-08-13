"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import {
  DatePicker,
  Calendar,
  Label,
  ListBox,
  ListBoxItem,
  Select,
} from "@heroui/react";
import { DateInputGroup } from "@heroui/react/date-input-group";
import {
  getLocalTimeZone,
  parseDateTime,
  type DateValue,
} from "@internationalized/date";
import dayjs from "dayjs";
import { adminProjectNameListApi } from "@/api/admin";

export interface ActivityFormValue {
  project_id: string | undefined;
  activity_name: string | undefined;
  activity_start_time: number | undefined;
  activity_end_time: number | undefined;
  apply_start_time: number | undefined;
  apply_end_time: number | undefined;
}

export interface ActivityFormRef {
  formValue: ActivityFormValue;
}

interface SubjectOption {
  label: string;
  value: string;
}

const tsToDateValue = (ts: number | undefined): DateValue | null => {
  if (!ts) return null;
  const d = dayjs(ts);
  return parseDateTime(d.format("YYYY-MM-DDTHH:mm"));
};

const dateValueToTs = (value: DateValue | null): number | undefined => {
  if (!value) return undefined;
  return value.toDate(getLocalTimeZone()).getTime();
};

interface ActivityFormProps {
  initialValue?: Partial<ActivityFormValue>;
}

const ActivityForm = forwardRef<ActivityFormRef, ActivityFormProps>((props, ref) => {
  const [options, setOptions] = useState<SubjectOption[]>([]);
  const [formValue, setFormValue] = useState<ActivityFormValue>({
    project_id: undefined,
    activity_name: undefined,
    activity_start_time: undefined,
    activity_end_time: undefined,
    apply_start_time: undefined,
    apply_end_time: undefined,
    ...props.initialValue,
  });

  useEffect(() => {
    adminProjectNameListApi().then((res) => {
      setOptions(
        res?.detail?.map((item) => ({
          label: item.project_name,
          value: String(item.project_id),
        })) ?? []
      );
    });
  }, []);

  useImperativeHandle(ref, () => ({
    get formValue() {
      return formValue;
    },
  }));

  const renderDatePicker = (
    label: string,
    field:
      | "activity_start_time"
      | "activity_end_time"
      | "apply_start_time"
      | "apply_end_time"
  ) => (
    <DatePicker
      className="w-full"
      granularity="minute"
      value={tsToDateValue(formValue[field])}
      onChange={(value) =>
        setFormValue((prev) => ({ ...prev, [field]: dateValueToTs(value) }))
      }
    >
      <Label>{label}</Label>
      <DatePicker.Trigger>
        <DateInputGroup>
          <DateInputGroup.Input>
            {(segment) => <DateInputGroup.Segment segment={segment} />}
          </DateInputGroup.Input>
          <DateInputGroup.Suffix>
            <DatePicker.TriggerIndicator />
          </DateInputGroup.Suffix>
        </DateInputGroup>
      </DatePicker.Trigger>
      <DatePicker.Popover>
        <Calendar aria-label={label}>
          <Calendar.Header>
            <Calendar.NavButton slot="previous" />
            <Calendar.Heading />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>
              {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
            </Calendar.GridHeader>
            <Calendar.GridBody>
              {(date) => <Calendar.Cell date={date} />}
            </Calendar.GridBody>
          </Calendar.Grid>
        </Calendar>
      </DatePicker.Popover>
    </DatePicker>
  );

  return (
    <div className="flex flex-col gap-4">
      <Select aria-label="select"
        className="w-full"
        selectedKey={formValue.project_id ?? null}
        onSelectionChange={(key) =>
          setFormValue((prev) => ({ ...prev, project_id: key == null ? undefined : String(key) }))
        }
        placeholder="Please select subject"
      >
        <Label>Subject</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {options.map((opt) => (
              <ListBoxItem key={opt.value} id={opt.value} textValue={opt.label}>
                {opt.label}
              </ListBoxItem>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      {renderDatePicker("Start Time", "activity_start_time")}
      {renderDatePicker("End Time", "activity_end_time")}
      {renderDatePicker("App Start Time", "apply_start_time")}
      {renderDatePicker("App End Time", "apply_end_time")}
    </div>
  );
});

ActivityForm.displayName = "ActivityForm";

export default ActivityForm;
