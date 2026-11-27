import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Search } from "lucide-react";
import StatusBadge from "../components/common/StatusBadge";
import PatientFormModal from "../components/patients/PatientFormModal";
import { useAuth } from "../context/useAuth";
import {
  createPatient,
  subscribeToPatients,
  updatePatient,
} from "../services/patientService";
import { calculateAge, formatClinicalDate } from "../utils/formatters";

export default function PatientsPage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsubscribe = subscribeToPatients(
      user.uid,
      (list) => {
        setPatients(list);
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Failed to load patient records.");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user?.uid]);

  const filteredPatients = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return patients.filter((patient) => {
      const matchesQuery =
        !q ||
        patient.fullName?.toLowerCase().includes(q) ||
        patient.mrn?.toLowerCase().includes(q) ||
        patient.phone?.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "All" || patient.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [patients, queryText, statusFilter]);

  const handleOpenCreate = () => {
    setEditingPatient(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (patient) => {
    setEditingPatient(patient);
    setModalOpen(true);
  };

  const handleSavePatient = async (formData) => {
    if (editingPatient) {
      await updatePatient(editingPatient.id, formData);
    } else {
      await createPatient(user.uid, formData);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Patient management
          </h1>
          <p className="text-sm text-secondary mt-1">
            Register patients, update baseline records, and initiate joint
            screenings.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-accent-foreground rounded-sm shrink-0"
        >
          Add patient
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-2.5 text-sm bg-danger-bg text-danger-text border border-danger-border rounded-sm"
        >
          {error}
        </div>
      )}

      {/* Search and filter toolbar */}
      <search className="bg-surface border border-border rounded-sm p-3.5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-8">
            <label
              htmlFor="patient-search"
              className="block text-xs font-medium text-secondary mb-1"
            >
              Search patient directory
            </label>
            <div className="relative">
              <Search
                size={15}
                strokeWidth={1.75}
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                id="patient-search"
                type="search"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Search by full name, MRN, or phone"
                className="w-full pl-9 pr-3 py-1.5 bg-surface border border-border rounded-sm text-sm text-foreground"
              />
            </div>
          </div>

          <div className="md:col-span-4">
            <label
              htmlFor="status-filter"
              className="block text-xs font-medium text-secondary mb-1"
            >
              Care status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-surface border border-border rounded-sm text-sm text-foreground"
            >
              <option value="All">All statuses</option>
              <option value="Active">Active</option>
              <option value="Follow-up">Follow-up</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </search>

      {/* Patient Directory Table */}
      <section className="bg-surface border border-border rounded-sm">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 id="patient-registry-heading" className="text-base font-semibold text-foreground">
            Registered patients
          </h2>
          <span className="text-xs text-secondary">
            Showing {filteredPatients.length} of {patients.length}
          </span>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="patient-registry-heading"
          className="clinical-table-region"
        >
          <table className="clinical-table">
            <thead>
              <tr>
                <th scope="col">MRN</th>
                <th scope="col">Patient name</th>
                <th scope="col">Age / Sex</th>
                <th scope="col">Phone</th>
                <th scope="col">Primary joint</th>
                <th scope="col">Last screening</th>
                <th scope="col">Last risk</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center text-secondary py-8">
                    Loading patient registry...
                  </td>
                </tr>
              ) : filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-secondary py-8">
                    {patients.length === 0
                      ? "No patients registered yet. Click \"Add patient\" to create the first record."
                      : "No patients match the current search or filter criteria."}
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient) => {
                  const age = calculateAge(patient.dateOfBirth);
                  return (
                    <tr key={patient.id}>
                      <td className="font-mono text-xs text-secondary whitespace-nowrap">
                        {patient.mrn}
                      </td>
                      <td className="font-medium text-foreground whitespace-nowrap">
                        <Link
                          to={`/patients/${patient.id}`}
                          className="hover:underline"
                        >
                          {patient.fullName}
                        </Link>
                      </td>
                      <td className="text-secondary whitespace-nowrap">
                        {age !== null ? `${age}y` : "—"} / {patient.sex}
                      </td>
                      <td className="text-secondary whitespace-nowrap">
                        {patient.phone}
                      </td>
                      <td className="whitespace-nowrap">
                        {patient.affectedSide} {patient.primaryJoint}
                      </td>
                      <td className="text-secondary whitespace-nowrap">
                        {formatClinicalDate(patient.lastScreeningAt)}
                      </td>
                      <td>
                        <StatusBadge status={patient.lastRiskLevel} />
                      </td>
                      <td>
                        <StatusBadge status={patient.status} />
                      </td>
                      <td className="text-right whitespace-nowrap space-x-3">
                        <Link
                          to={`/patients/${patient.id}`}
                          className="text-sm text-secondary hover:text-foreground hover:underline"
                        >
                          Details
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(patient)}
                          className="text-sm text-secondary hover:text-foreground hover:underline"
                        >
                          Edit
                        </button>
                        <Link
                          to={`/screening?patientId=${patient.id}`}
                          className="text-sm font-medium text-link hover:underline"
                        >
                          Screen
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <PatientFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSavePatient}
        initialPatient={editingPatient}
      />
    </div>
  );
}
