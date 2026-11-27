import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export default function ModalDialog({
  open,
  onClose,
  title,
  children,
  widthClass = "w-full",
}) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const handleClose = () => {
      dialog.returnValue = "";
      onClose?.();
    };

    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  const handleBackdropPointer = (event) => {
    const dialog = dialogRef.current;
    if (!dialog || event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const clickedOutside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;
    if (clickedOutside) {
      dialog.close("dismiss");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={handleBackdropPointer}
      className={widthClass}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface">
        <h1 id={titleId} className="text-base font-semibold text-foreground">
          {title}
        </h1>
        <button
          type="button"
          onClick={() => dialogRef.current?.close("cancel")}
          aria-label="Close dialog"
          className="p-1 text-secondary hover:text-foreground hover:bg-surface-muted rounded-[3px]"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
      <div className="p-5 overflow-y-auto max-h-[calc(100dvh-7rem)]">{children}</div>
    </dialog>
  );
}
