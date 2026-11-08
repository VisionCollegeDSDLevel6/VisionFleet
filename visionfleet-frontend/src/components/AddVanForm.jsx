
import { useState } from "react";
import { addVan } from "../services/vanService";

export default function AddVanForm({
  onAdded,
  onCancel,
}) {
  const [registration, setRegistration] = useState("");
  const [makeModel, setMakeModel] = useState("");
  const [capacity, setCapacity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    if (saving) {
      return;
    }

    setError("");

    const cleanRegistration = registration.trim();
    const cleanMakeModel = makeModel.trim();
    const seatCount = Number(capacity);

    if (!cleanRegistration || !cleanMakeModel) {
      setError(
        "Registration and vehicle model are required."
      );
      return;
    }

    if (
      !Number.isInteger(seatCount) ||
      seatCount < 1 ||
      seatCount > 50
    ) {
      setError(
        "Capacity must be a whole number between 1 and 50."
      );
      return;
    }

    setSaving(true);

    try {
      const createdVan = await addVan({
        registration: cleanRegistration,
        makeModel: cleanMakeModel,
        capacity: seatCount,
      });

      onAdded(createdVan);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to add vehicle."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="vf-addvan-card"
      aria-labelledby="add-van-title"
    >
      <div className="vf-addvan-heading">
        <div>
          <span className="vf-addvan-eyebrow">
            FLEET REGISTRATION
          </span>

          <h2 id="add-van-title">
            Add new vehicle
          </h2>

          <p>
            Enter the details of the vehicle you
            want to register in Vision Fleet.
          </p>
        </div>

        <button
          type="button"
          className="vf-addvan-close"
          onClick={onCancel}
          disabled={saving}
          aria-label="Close add vehicle form"
        >
          ×
        </button>
      </div>

      <form
        className="vf-addvan-form"
        onSubmit={handleSubmit}
      >
        <div className="vf-addvan-fields">
          <div className="vf-addvan-field">
            <label htmlFor="new-van-registration">
              Registration
            </label>

            <input
              id="new-van-registration"
              type="text"
              placeholder="e.g. ABC123"
              autoComplete="off"
              maxLength={20}
              value={registration}
              onChange={(event) =>
                setRegistration(event.target.value)
              }
              disabled={saving}
              required
            />
          </div>

          <div className="vf-addvan-field">
            <label htmlFor="new-van-model">
              Make and model
            </label>

            <input
              id="new-van-model"
              type="text"
              placeholder="e.g. Toyota Hiace"
              maxLength={120}
              value={makeModel}
              onChange={(event) =>
                setMakeModel(event.target.value)
              }
              disabled={saving}
              required
            />
          </div>

          <div className="vf-addvan-field">
            <label htmlFor="new-van-capacity">
              Passenger capacity
            </label>

            <input
              id="new-van-capacity"
              type="number"
              placeholder="e.g. 12"
              min="1"
              max="50"
              step="1"
              value={capacity}
              onChange={(event) =>
                setCapacity(event.target.value)
              }
              disabled={saving}
              required
            />
          </div>
        </div>

        {error && (
          <p
            className="vf-addvan-error"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="vf-addvan-footer">
          <p>
            New vehicles will initially have
            the status <strong>Available</strong>.
          </p>

          <div className="vf-addvan-actions">
            <button
              type="button"
              className="vf-addvan-cancel"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="vf-addvan-save"
              disabled={saving}
            >
              {saving
                ? "Adding vehicle..."
                : "Save vehicle"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
