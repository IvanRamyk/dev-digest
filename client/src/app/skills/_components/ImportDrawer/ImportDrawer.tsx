/* ImportDrawer — file dropzone (.md/.zip) → preview (extracted skill + skipped
   entries) → Save. Nothing is persisted before Save; the preview call itself
   writes nothing server-side either. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, Button, Icon, Badge } from "@devdigest/ui";
import { usePreviewImport, useImportSkill, type SkillImportPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { fileToBase64 } from "./helpers";
import { ACCEPT, DRAWER_WIDTH } from "./constants";
import { s } from "./styles";

export function ImportDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const preview = usePreviewImport();
  const confirm = useImportSkill();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [result, setResult] = React.useState<SkillImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);
    try {
      const content_base64 = await fileToBase64(file);
      const previewed = await preview.mutateAsync({ filename: file.name, content_base64 });
      setResult(previewed);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("drawer.previewFailed"));
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const save = async () => {
    if (!result) return;
    try {
      const skill = await confirm.mutateAsync(result);
      toast.success(t("editor.config.savedToast", { version: skill.version }));
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("drawer.importFailed"));
    }
  };

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("drawer.cancel")}
          </Button>
          <Button kind="primary" icon="Check" onClick={save} disabled={!result || confirm.isPending}>
            {confirm.isPending ? t("drawer.saving") : t("drawer.save")}
          </Button>
        </div>
      }
    >
      <div
        style={s.dropzone(dragging)}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Icon.Upload size={22} style={{ color: "var(--text-muted)" }} />
        <div style={s.dropzoneText}>{t("drawer.dropzone")}</div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          style={s.hiddenInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>

      {preview.isPending && <div style={s.section}>{t("drawer.previewing")}</div>}
      {error && <div style={s.error}>{error}</div>}

      {result && (
        <div style={s.section}>
          <div style={s.previewHeader}>
            <span style={s.previewName}>{result.name}</span>
            <Badge color="var(--text-secondary)">{t(`listItem.type.${result.type}`)}</Badge>
          </div>
          <div style={s.previewBody}>{result.body}</div>
          {result.skipped.length > 0 && (
            <div style={s.section}>
              <div>{t("drawer.skippedTitle", { count: result.skipped.length })}</div>
              <div style={s.skippedList}>
                {result.skipped.map((entry) => (
                  <div key={entry.path} style={s.skippedRow}>
                    <Icon.Slash size={12} />
                    <span className="mono">{entry.path}</span>
                    <span>({t(`drawer.skippedReason.${entry.reason}`)})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={s.notice}>{t("drawer.willLandDisabled")}</div>
        </div>
      )}
    </Drawer>
  );
}
