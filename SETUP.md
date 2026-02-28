# NotesAreBoring — Setup & Deploy Guide

## What You Need
- A **GitHub** account (free) — to store your code
- A **Supabase** account (free) — your database + auth + real-time
- A **Vercel** account (free) — to host your website

---

## Step 1: Set Up Supabase (Database)

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **"New Project"**
3. Name it `notesareboring`, pick a strong password, choose the closest region
4. Wait for it to spin up (~2 minutes)
5. Go to **SQL Editor** (left sidebar)
6. Open the file `supabase-schema.sql` from this project
7. Paste the entire contents into the SQL Editor and click **Run**
8. You should see all tables created successfully

### Get Your Keys
1. Go to **Settings → API** in your Supabase dashboard
2. Copy these two values:
   - **Project URL** (looks like `https://abcdefg.supabase.co`)
   - **anon public key** (long string starting with `eyJ...`)
3. Open `js/supabase-client.js` and replace:
   - `YOUR_SUPABASE_URL` with your Project URL
   - `YOUR_SUPABASE_ANON_KEY` with your anon key

### Enable Auth (Optional but Recommended)
1. Go to **Authentication → Providers**
2. Enable **Email** (on by default)
3. Enable **Google** if you want Google sign-in:
   - You'll need a Google Cloud OAuth client ID
   - Supabase has a guide for this in their docs

---

## Step 2: Supabase Scripts (Already Done!)

The Supabase script tags have already been added to every HTML page. No action needed here.

---

## Step 3: Upload to GitHub (No Terminal Needed!)

You don't need to install anything or open a terminal. Do it all from your browser:

1. Go to [github.com/new](https://github.com/new) and create a new repo called `notesareboring`
2. Make sure it's set to **Public** (so Vercel can see it)
3. DON'T check "Add a README" — leave it empty
4. Click **Create repository**
5. On the next page, click **"uploading an existing file"** (blue link)
6. Open your `notesareboring-site` folder on your computer
7. Select ALL the files and folders (style.css, index.html, js/ folder, etc.) and drag them into the GitHub upload area
8. Scroll down, click **"Commit changes"**
9. Done! Your code is now on GitHub.

---

## Step 4: Deploy on Vercel (No Terminal Needed!)

1. Go to [vercel.com](https://vercel.com) and click **"Sign Up"** → sign in with your GitHub account
2. Click **"Add New → Project"**
3. Find your `notesareboring` repo and click **Import**
4. Framework Preset: **Other** (it's a static site)
5. Click **Deploy**
6. Wait ~30 seconds — you'll get a live URL like `notesareboring.vercel.app`
7. Your site is now LIVE on the internet!

### Custom Domain (Optional)
1. In Vercel, go to your project → **Settings → Domains**
2. Add your domain (e.g., `notesareboring.com`)
3. Update your domain's DNS as Vercel instructs

---

## How It All Connects

```
[Student Phone]  →  notesareboring.vercel.app  →  [Supabase Real-time]
                                                          ↕
[Teacher Laptop] →  notesareboring.vercel.app  →  [Supabase Database]
```

- **Vercel** hosts your HTML/CSS/JS files (the frontend)
- **Supabase** handles everything backend:
  - Database (PostgreSQL) — stores teachers, quizzes, games, scores
  - Auth — teacher login/signup
  - Real-time — live game updates (players joining, answers coming in, leaderboard)
  - Storage — uploaded note files (PDF, DOCX, PPTX)

---

## Database Tables

| Table | What It Stores |
|-------|---------------|
| `teachers` | Teacher accounts, plans, profiles |
| `quiz_packs` | Generated quiz packs from uploaded notes |
| `questions` | 10 questions per quiz pack |
| `games` | Live game sessions with 6-digit codes |
| `players` | Students who joined a game |
| `responses` | Every answer submitted |
| `game_results` | Final scores and rankings |

---

## Free Tier Limits

### Supabase Free
- 500 MB database
- 50,000 monthly active users
- 2 GB file storage
- 200 concurrent real-time connections
- Plenty for getting started!

### Vercel Free
- 100 GB bandwidth/month
- Unlimited deployments
- Auto-deploys when you push to GitHub

---

## Quick Reference — Using the JS Client

```javascript
// Sign up a teacher
await NotesAreBoring.Auth.signUp('teacher@school.com', 'password123', 'Ms. Johnson');

// Create a quiz pack with questions
await NotesAreBoring.QuizPacks.create('Cell Biology Ch5', 'Biology', 'bio_ch5.pdf', [
  {
    question: 'What is the powerhouse of the cell?',
    type: 'multiple_choice',
    difficulty: 'easy',
    options: ['Mitochondria', 'Nucleus', 'Ribosome', 'Golgi Body'],
    correct: 'A',
    timeLimit: 20
  },
  // ... 9 more questions
]);

// Start a game
const game = await NotesAreBoring.Games.create(quizPackId);
console.log('Game code:', game.game_code); // e.g. "482019"

// Student joins
const player = await NotesAreBoring.Players.join(game.id, 'QuizKhalifa');

// Listen for players joining (real-time)
NotesAreBoring.Games.subscribeToPlayers(game.id, (payload) => {
  console.log('Player joined:', payload.new.nickname);
});

// Submit an answer
const result = await NotesAreBoring.Players.submitAnswer(
  game.id, player.id, questionId, 'A', 3200 // 3.2 seconds
);
console.log('Points earned:', result.points);

// Get leaderboard
const leaderboard = await NotesAreBoring.Players.getLeaderboard(game.id);
```
