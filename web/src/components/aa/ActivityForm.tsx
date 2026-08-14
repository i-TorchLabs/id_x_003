"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import {
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Select,
  TextField,
} from "@heroui/react";
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

/** 毫秒时间戳 -> datetime-local 输入框值 (yyyy-MM-ddTHH:mm) */
const tsToInputValue = (ts: number | undefined): string => {
  if (!ts) return "";
  return dayjs(ts).format("YYYY-MM-DDTHH:mm");
};

/** datetime-local 输入框值 -> 毫秒时间戳 */
const inputValueToTs = (value: string): number | undefined => {
  if (!value) return undefined;
  return dayjs(value).valueOf();
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
    <TextField
      className="w-full"
      value={tsToInputValue(formValue[field])}
      onChange={(value) =>
        setFormValue((prev) => ({ ...prev, [field]: inputValueToTs(value) }))
      }
      aria-label={label}
    >
      <Label>{label}</Label>
      <Input type="datetime-local" placeholder={label} />
    </TextField>
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
