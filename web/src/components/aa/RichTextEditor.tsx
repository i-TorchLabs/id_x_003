"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type Quill from "quill";
import "quill/dist/quill.snow.css";

export interface RichTextEditorRef {
  getHtmlContent: () => string;
  getJsonContent: () => any;
  setContents: (content: string) => void;
}

interface RichTextEditorProps {
  height?: number | string;
}

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ height = "auto" }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const quillRef = useRef<Quill | null>(null);

    useEffect(() => {
      let destroyed = false;
      const init = async () => {
        const { default: Quill } = await import("quill");
        if (destroyed || !containerRef.current || quillRef.current) return;
        const options = {
          modules: {
            toolbar: [
              ["bold", "italic", "underline", "strike"],
              ["blockquote", "code-block"],

              [{ list: "ordered" }, { list: "bullet" }],
              [{ script: "sub" }, { script: "super" }],
              [{ indent: "-1" }, { indent: "+1" }],
              [{ direction: "rtl" }],

              [{ size: ["small", false, "large", "huge"] }],
              [{ header: [1, 2, 3, 4, 5, 6, false] }],

              [{ color: [] }, { background: [] }],
              [{ align: [] }],

              ["link", "image"],

              ["clean"],
            ],
          },
          placeholder: "Please input ...",
          theme: "snow",
        };
        quillRef.current = new Quill(containerRef.current, options);
      };
      init();
      return () => {
        destroyed = true;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      getHtmlContent: () => {
        return (containerRef.current?.firstChild as HTMLElement | null)?.innerHTML ?? "";
      },
      getJsonContent: () => {
        return JSON.stringify(quillRef.current?.getContents());
      },
      setContents: (content: string) => {
        quillRef.current?.clipboard.dangerouslyPasteHTML(content);
      },
    }));

    return (
      <div
        ref={containerRef}
        style={{ height: typeof height === "number" ? `${height}px` : height }}
      />
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";

export default RichTextEditor;
