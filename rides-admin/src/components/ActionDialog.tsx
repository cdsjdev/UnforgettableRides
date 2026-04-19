type ActionDialogProps = {
  open: boolean;
  title: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmVariant?: 'primary' | 'danger';
  confirmDisabled?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputValue?: string;
  onInputChange?: (value: string) => void;
};

function ActionDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  confirmVariant = 'primary',
  confirmDisabled = false,
  inputLabel,
  inputPlaceholder,
  inputValue,
  onInputChange,
}: ActionDialogProps) {
  if (!open) return null;

  return (
    <div className="action-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="action-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {message ? <p>{message}</p> : null}
        {onInputChange ? (
          <div className="action-dialog-input-wrap">
            {inputLabel ? <label>{inputLabel}</label> : null}
            <textarea
              value={inputValue || ''}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder={inputPlaceholder}
              rows={3}
            />
          </div>
        ) : null}
        <div className="action-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn ${confirmVariant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ActionDialog;
