ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT '2v2';
ALTER TABLE public.rooms ADD CONSTRAINT rooms_mode_check CHECK (mode IN ('2v2','1v1'));