-- Group-specific attendance behavior; existing groups keep trainer roll call.
ALTER TABLE appbasis_training_group
  ADD COLUMN attendance_mode text NOT NULL DEFAULT 'trainer_roll_call'
  CONSTRAINT appbasis_training_group_attendance_mode_check
  CHECK (attendance_mode IN ('trainer_roll_call', 'self_registration'));
