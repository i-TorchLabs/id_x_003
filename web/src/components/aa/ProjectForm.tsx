"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
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
import RichTextEditor, { type RichTextEditorRef } from "./RichTextEditor";
import { adminProjectOwnerSearchApi } from "@/api/admin";

export interface ProjectFormValue {
  project_name: string;
  quota: string;
  owner: string | null;
}

export interface ProjectFormRef {
  formValue: ProjectFormValue;
  richTextEditor: RichTextEditorRef | null;
}

interface ProjectFormProps {
  initialValue?: Partial<ProjectFormValue>;
}

const ProjectForm = forwardRef<ProjectFormRef, ProjectFormProps>((props, ref) => {
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const richTextEditorRef = useRef<RichTextEditorRef>(null);
  const [formValue, setFormValue] = useState<ProjectFormValue>({
    project_name: "",
    quota: "",
    owner: null,
    ...props.initialValue,
  });

  useEffect(() => {
    const getOptions = async () => {
      const { owner_list } = await adminProjectOwnerSearchApi();
      setOptions(owner_list.map((item) => ({ label: item, value: item })));
    };
    getOptions();
  }, []);

  useImperativeHandle(ref, () => ({
    get formValue() {
      return formValue;
    },
    get richTextEditor() {
      return richTextEditorRef.current;
    },
  }));

  return (
    <div className="flex flex-col gap-4">
      <TextField
        className="w-full"
        value={formValue.project_name}
        onChange={(value) => setFormValue((prev) => ({ ...prev, project_name: value }))}
      >
        <Label>Subject Name</Label>
        <Input placeholder="Please Input Subject Name" />
      </TextField>
      <div>
        <Label>Contents</Label>
        <div>
          <RichTextEditor ref={richTextEditorRef} height={400} />
        </div>
      </div>
      <TextField
        className="w-full"
        value={formValue.quota}
        onChange={(value) => setFormValue((prev) => ({ ...prev, quota: value }))}
      >
        <Label>Offered</Label>
        <Input placeholder="Please Input Offered" />
      </TextField>
      <Select aria-label="select"
        className="w-full"
        selectedKey={formValue.owner}
        onSelectionChange={(key) =>
          setFormValue((prev) => ({ ...prev, owner: key == null ? null : String(key) }))
        }
        placeholder="Please Select Owner"
      >
        <Label>Owner</Label>
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
    </div>
  );
});

ProjectForm.displayName = "ProjectForm";

export default ProjectForm;
