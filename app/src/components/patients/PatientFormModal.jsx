import { useState } from "react";
import ModalDialog from "../common/ModalDialog";

function buildInitialForm(initialPatient) {
  if (!initialPatient) {
    return {
      mrn: "",
      fullName: "",
      dateOfBirth: "",
      sex: "Female",
      phone: "",
      email: "",
      primaryJoint: "Knee",
      affectedSide: "Right",
      status: "Active",
      clinicalNotes: "",
    };
  }
  return {
    mrn: initialPatient.mrn || "",
    fullName: initialPatient.fullName || "",
    dateOfBirth: initialPatient.dateOfBirth || "",
    sex: initialPatient.sex || "Female",
    phone: initialPatient.phone || "",
    email: initialPatient.email || "",
    primaryJoint: initialPatient.primaryJoint || "Knee",
    affectedSide: initialPatient.affectedSide || "Right",
    status: initialPatient.status || "Active",
    clinicalNotes: initialPatient.clinicalNotes || "",
  };
}

function PatientFormBody({ initialPatient, onClose, onSubmit }) {
  const [form, setForm] = useState(() => buildInitialForm(initialPatient));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await onSubmit(form);
      onClose();
    } catch (err) {
      setError(err.message || "Unable to save patient record.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="px-3 py-2 text-sm bg-danger-bg text-danger-text border border-danger-border rounded-sm"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="patient-mrn"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Medical Record Number (MRN) <span aria-hidden="true">*</span>
          </label>
          <input
            id="patient-mrn"
            name="mrn"
            type="text"
            required
            autoFocus={!initialPatient}
            readOnly={Boolean(initialPatient)}
            disabled={Boolean(initialPatient)}
            value={form.mrn}
            onChange={handleChange}
            placeholder="JS-1042"
            className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground disabled:bg-surface-muted disabled:text-secondary"
          />
          {initialPatient && (
            <span className="block text-xs text-muted mt-1">
              MRN is permanent after registration.
            </span>
          )}
        </div>

        <div>
          <label
            htmlFor="patient-name"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Full name <span aria-hidden="true">*</span>
          </label>
          <input
            id="patient-name"
            name="fullName"
            type="text"
            required
            autoComplete="name"
            value={form.fullName}
            onChange={handleChange}
            className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
          />
        </div>

        <div>
          <label
            htmlFor="patient-dob"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Date of birth <span aria-hidden="true">*</span>
          </label>
          <input
            id="patient-dob"
            name="dateOfBirth"
            type="date"
            required
            value={form.dateOfBirth}
            onChange={handleChange}
            className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
          />
        </div>

        <div>
          <label
            htmlFor="patient-sex"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Sex <span aria-hidden="true">*</span>
          </label>
          <select
            id="patient-sex"
            name="sex"
            required
            value={form.sex}
            onChange={handleChange}
            className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
          >
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="patient-phone"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Phone number <span aria-hidden="true">*</span>
          </label>
          <input
            id="patient-phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            value={form.phone}
            onChange={handleChange}
            className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
          />
        </div>

        <div>
          <label
            htmlFor="patient-email"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Email address
          </label>
          <input
            id="patient-email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            value={form.email}
            onChange={handleChange}
            className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
          />
        </div>

        <div>
          <label
            htmlFor="patient-joint"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Primary joint <span aria-hidden="true">*</span>
          </label>
          <select
            id="patient-joint"
            name="primaryJoint"
            required
            value={form.primaryJoint}
            onChange={handleChange}
            className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
          >
            <option value="Knee">Knee</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="patient-side"
            className="block text-sm font-medium text-foreground mb-1"
          >
            Affected side <span aria-hidden="true">*</span>
          </label>
          <select
            id="patient-side"
            name="affectedSide"
            required
            value={form.affectedSide}
            onChange={handleChange}
            className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
          >
            <option value="Right">Right</option>
            <option value="Left">Left</option>
            <option value="Bilateral">Bilateral</option>
          </select>
        </div>
      </div>

      <div>
        <label
          htmlFor="patient-status"
          className="block text-sm font-medium text-foreground mb-1"
        >
          Care status
        </label>
        <select
          id="patient-status"
          name="status"
          value={form.status}
          onChange={handleChange}
          className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
        >
          <option value="Active">Active</option>
          <option value="Follow-up">Follow-up</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="patient-notes"
          className="block text-sm font-medium text-foreground mb-1"
        >
          Baseline clinical notes
        </label>
        <textarea
          id="patient-notes"
          name="clinicalNotes"
          rows={3}
          value={form.clinicalNotes}
          onChange={handleChange}
          placeholder="Relevant surgical history, comorbidities, or mobility aids"
          className="w-full px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground"
        />
      </div>

      <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-secondary hover:text-foreground bg-surface-muted hover:bg-surface-hover border border-border rounded-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm"
        >
          {submitting
            ? "Saving..."
            : initialPatient
              ? "Save changes"
              : "Register patient"}
        </button>
      </div>
    </form>
  );
}

export default function PatientFormModal({
  open,
  onClose,
  onSubmit,
  initialPatient = null,
}) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={initialPatient ? "Edit patient record" : "Register new patient"}
    >
      {open && (
        <PatientFormBody
          key={initialPatient?.id || "new"}
          initialPatient={initialPatient}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </ModalDialog>
  );
}
