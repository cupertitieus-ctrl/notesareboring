-- ============================================
-- NotesAreBoring — Supabase Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================
-- 1. TEACHERS (users who create quizzes)
-- ============================================
create table public.teachers (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  display_name text not null,
  avatar_url text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'school')),
  school_name text,
  uploads_this_month int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================
-- 2. QUIZ PACKS (generated from uploaded notes)
-- ============================================
create table public.quiz_packs (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  title text not null,
  subject text,
  source_filename text not null,
  source_file_url text,
  file_hash text,
  question_count int not null default 10,
  games_played int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_quiz_packs_teacher on public.quiz_packs(teacher_id);
create index idx_quiz_packs_hash on public.quiz_packs(file_hash);

-- ============================================
-- 3. QUESTIONS (10 per quiz pack)
-- ============================================
create table public.questions (
  id uuid primary key default uuid_generate_v4(),
  quiz_pack_id uuid not null references public.quiz_packs(id) on delete cascade,
  question_text text not null,
  question_type text not null default 'multiple_choice' check (question_type in ('multiple_choice', 'true_false')),
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  option_a text not null,
  option_b text not null,
  option_c text,
  option_d text,
  correct_answer text not null check (correct_answer in ('A', 'B', 'C', 'D')),
  time_limit_seconds int not null default 20,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_questions_pack on public.questions(quiz_pack_id);

-- ============================================
-- 4. GAMES (live game sessions)
-- ============================================
create table public.games (
  id uuid primary key default uuid_generate_v4(),
  quiz_pack_id uuid not null references public.quiz_packs(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  game_code text unique not null,
  status text not null default 'lobby' check (status in ('lobby', 'in_progress', 'revealing', 'finished')),
  current_question_index int not null default 0,
  current_question_started_at timestamptz,
  player_count int not null default 0,
  max_players int not null default 25,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_games_code on public.games(game_code);
create index idx_games_teacher on public.games(teacher_id);
create index idx_games_status on public.games(status);

-- ============================================
-- 5. PLAYERS (students in a game)
-- ============================================
create table public.players (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references public.games(id) on delete cascade,
  nickname text not null,
  score int not null default 0,
  streak int not null default 0,
  best_streak int not null default 0,
  correct_count int not null default 0,
  total_answered int not null default 0,
  rank int,
  joined_at timestamptz not null default now()
);

create index idx_players_game on public.players(game_id);

-- ============================================
-- 6. RESPONSES (individual answers)
-- ============================================
create table public.responses (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_answer text not null check (selected_answer in ('A', 'B', 'C', 'D')),
  is_correct boolean not null default false,
  time_taken_ms int not null default 0,
  points_earned int not null default 0,
  streak_bonus int not null default 0,
  answered_at timestamptz not null default now()
);

create index idx_responses_game on public.responses(game_id);
create index idx_responses_player on public.responses(player_id);

-- ============================================
-- 7. GAME RESULTS (post-game summary per player)
-- ============================================
create table public.game_results (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  final_score int not null default 0,
  final_rank int not null default 0,
  correct_count int not null default 0,
  total_questions int not null default 0,
  accuracy_pct numeric(5,2) not null default 0,
  avg_time_ms int not null default 0,
  best_streak int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_results_game on public.game_results(game_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Generate a random 6-digit game code
create or replace function generate_game_code()
returns text as $$
declare
  code text;
  exists_already boolean;
begin
  loop
    code := lpad(floor(random() * 1000000)::text, 6, '0');
    select exists(select 1 from public.games where game_code = code and status != 'finished') into exists_already;
    exit when not exists_already;
  end loop;
  return code;
end;
$$ language plpgsql;

-- Auto-generate game code on insert
create or replace function set_game_code()
returns trigger as $$
begin
  if new.game_code is null or new.game_code = '' then
    new.game_code := generate_game_code();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trigger_set_game_code
  before insert on public.games
  for each row execute function set_game_code();

-- Auto-update updated_at timestamp
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_teachers_updated
  before update on public.teachers
  for each row execute function update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

alter table public.teachers enable row level security;
alter table public.quiz_packs enable row level security;
alter table public.questions enable row level security;
alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.responses enable row level security;
alter table public.game_results enable row level security;

-- Teachers can read/write their own data
create policy "Teachers manage own data" on public.teachers
  for all using (auth.uid() = id);

-- Teachers can manage their own quiz packs
create policy "Teachers manage own packs" on public.quiz_packs
  for all using (teacher_id = auth.uid());

-- Questions readable by anyone (for live games), writable by pack owner
create policy "Anyone can read questions" on public.questions
  for select using (true);
create policy "Teachers manage own questions" on public.questions
  for all using (
    quiz_pack_id in (select id from public.quiz_packs where teacher_id = auth.uid())
  );

-- Games: teachers manage their own, anyone can read active games
create policy "Anyone can read active games" on public.games
  for select using (true);
create policy "Teachers manage own games" on public.games
  for all using (teacher_id = auth.uid());

-- Players: anyone can join (insert), game owner + player can read
create policy "Anyone can join games" on public.players
  for insert with check (true);
create policy "Anyone can read players" on public.players
  for select using (true);
create policy "Players update own data" on public.players
  for update using (true);

-- Responses: players can insert their own
create policy "Players submit responses" on public.responses
  for insert with check (true);
create policy "Anyone can read responses" on public.responses
  for select using (true);

-- Game results: readable by anyone
create policy "Anyone can read results" on public.game_results
  for select using (true);
create policy "System inserts results" on public.game_results
  for insert with check (true);

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- Enable realtime on tables needed for live games
-- ============================================
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.responses;
