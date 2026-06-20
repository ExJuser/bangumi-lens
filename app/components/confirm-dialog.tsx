"use client";

import { ReactNode } from "react";

type ConfirmDialogAction = {
  label: ReactNode;
  onClick: () => void;
  className: "secondary-action" | "primary-action";
};

type ConfirmDialogProps = {
  titleId: string;
  icon: ReactNode;
  label: ReactNode;
  title: ReactNode;
  description: ReactNode;
  onClose: () => void;
  actions: ConfirmDialogAction[];
};

export function ConfirmDialog({ titleId, icon, label, title, description, onClose, actions }: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirm-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="confirm-icon">{icon}</div>
        <div>
          <span className="label">{label}</span>
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="confirm-actions">
          {actions.map((action, index) => (
            <button className={action.className} key={index} type="button" onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
