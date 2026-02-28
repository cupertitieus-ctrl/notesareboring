// ============================================
// NotesAreBoring — Supabase Client
// Replace YOUR_SUPABASE_URL and YOUR_SUPABASE_ANON_KEY
// with your actual values from supabase.com/dashboard
// ============================================

const SUPABASE_URL = 'https://senfricilhfvwdkuzhwl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlbmZyaWNpbGhmdndka3V6aHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNTE3MjMsImV4cCI6MjA4NzgyNzcyM30.qeV1VAuIQHfZo2tkgqeNwuZ1YmXNVwYil9RSPcfnCmo';

// Initialize Supabase client (loaded via CDN in HTML)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// AUTH — Teacher login/signup
// ============================================
const Auth = {
  // Sign up with email + password
  async signUp(email, password, displayName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } }
    });
    if (error) throw error;

    // Create teacher profile
    if (data.user) {
      await supabase.from('teachers').insert({
        id: data.user.id,
        email,
        display_name: displayName
      });
    }
    return data;
  },

  // Sign in
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  // Sign in with Google
  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) throw error;
    return data;
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Get current user
  async getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  // Get teacher profile
  async getProfile() {
    const user = await this.getUser();
    if (!user) return null;
    const { data } = await supabase.from('teachers').select('*').eq('id', user.id).single();
    return data;
  }
};

// ============================================
// QUIZ PACKS — Upload notes & manage packs
// ============================================
const QuizPacks = {
  // Get all packs for current teacher
  async getMyPacks() {
    const user = await Auth.getUser();
    const { data, error } = await supabase
      .from('quiz_packs')
      .select('*, questions(count)')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  // Create a new quiz pack
  async create(title, subject, sourceFilename, questions) {
    const user = await Auth.getUser();

    // Insert the pack
    const { data: pack, error: packError } = await supabase
      .from('quiz_packs')
      .insert({
        teacher_id: user.id,
        title,
        subject,
        source_filename: sourceFilename,
        question_count: questions.length
      })
      .select()
      .single();
    if (packError) throw packError;

    // Insert questions
    const questionsToInsert = questions.map((q, i) => ({
      quiz_pack_id: pack.id,
      question_text: q.question,
      question_type: q.type || 'multiple_choice',
      difficulty: q.difficulty || 'medium',
      option_a: q.options[0],
      option_b: q.options[1],
      option_c: q.options[2] || null,
      option_d: q.options[3] || null,
      correct_answer: q.correct,
      time_limit_seconds: q.timeLimit || 20,
      sort_order: i
    }));

    const { error: qError } = await supabase.from('questions').insert(questionsToInsert);
    if (qError) throw qError;

    return pack;
  },

  // Get a single pack with its questions
  async getWithQuestions(packId) {
    const { data, error } = await supabase
      .from('quiz_packs')
      .select('*, questions(*)')
      .eq('id', packId)
      .single();
    if (error) throw error;
    return data;
  },

  // Delete a pack
  async delete(packId) {
    const { error } = await supabase.from('quiz_packs').delete().eq('id', packId);
    if (error) throw error;
  }
};

// ============================================
// GAMES — Live game management
// ============================================
const Games = {
  // Create a new game from a quiz pack
  async create(quizPackId) {
    const user = await Auth.getUser();
    const profile = await Auth.getProfile();
    const maxPlayers = profile.plan === 'free' ? 25 : 50;

    const { data, error } = await supabase
      .from('games')
      .insert({
        quiz_pack_id: quizPackId,
        teacher_id: user.id,
        max_players: maxPlayers
      })
      .select()
      .single();
    if (error) throw error;

    // Increment games_played count
    await supabase.rpc('increment_games_played', { pack_id: quizPackId });

    return data;
  },

  // Find a game by code (for students joining)
  async findByCode(gameCode) {
    const { data, error } = await supabase
      .from('games')
      .select('*, quiz_packs(title, subject)')
      .eq('game_code', gameCode)
      .in('status', ['lobby', 'in_progress'])
      .single();
    if (error) throw error;
    return data;
  },

  // Start the game (teacher)
  async start(gameId) {
    const { data, error } = await supabase
      .from('games')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        current_question_started_at: new Date().toISOString()
      })
      .eq('id', gameId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Move to next question (teacher)
  async nextQuestion(gameId, questionIndex) {
    const { data, error } = await supabase
      .from('games')
      .update({
        current_question_index: questionIndex,
        current_question_started_at: new Date().toISOString()
      })
      .eq('id', gameId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // End the game
  async finish(gameId) {
    const { data, error } = await supabase
      .from('games')
      .update({
        status: 'finished',
        finished_at: new Date().toISOString()
      })
      .eq('id', gameId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Subscribe to game updates (real-time)
  subscribeToGame(gameId, callback) {
    return supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`
      }, callback)
      .subscribe();
  },

  // Subscribe to players joining (real-time)
  subscribeToPlayers(gameId, callback) {
    return supabase
      .channel(`players-${gameId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `game_id=eq.${gameId}`
      }, callback)
      .subscribe();
  },

  // Subscribe to responses coming in (real-time)
  subscribeToResponses(gameId, callback) {
    return supabase
      .channel(`responses-${gameId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'responses',
        filter: `game_id=eq.${gameId}`
      }, callback)
      .subscribe();
  }
};

// ============================================
// PLAYERS — Student game participation
// ============================================
const Players = {
  // Join a game (student)
  async join(gameId, nickname) {
    const { data, error } = await supabase
      .from('players')
      .insert({ game_id: gameId, nickname })
      .select()
      .single();
    if (error) throw error;

    // Update player count
    await supabase.rpc('increment_player_count', { g_id: gameId });

    return data;
  },

  // Submit an answer
  async submitAnswer(gameId, playerId, questionId, selectedAnswer, timeTakenMs) {
    // Check if correct
    const { data: question } = await supabase
      .from('questions')
      .select('correct_answer, time_limit_seconds')
      .eq('id', questionId)
      .single();

    const isCorrect = selectedAnswer === question.correct_answer;

    // Calculate points (faster = more points, like Kahoot)
    let points = 0;
    let streakBonus = 0;
    if (isCorrect) {
      const timeRatio = 1 - (timeTakenMs / (question.time_limit_seconds * 1000));
      points = Math.round(1000 * Math.max(0.5, timeRatio));

      // Get current streak
      const { data: player } = await supabase
        .from('players')
        .select('streak')
        .eq('id', playerId)
        .single();

      const newStreak = (player?.streak || 0) + 1;
      if (newStreak >= 2) streakBonus = Math.min(newStreak * 100, 500);

      // Update player score + streak
      await supabase.from('players').update({
        score: supabase.raw(`score + ${points + streakBonus}`),
        streak: newStreak,
        best_streak: supabase.raw(`greatest(best_streak, ${newStreak})`),
        correct_count: supabase.raw('correct_count + 1'),
        total_answered: supabase.raw('total_answered + 1')
      }).eq('id', playerId);
    } else {
      // Reset streak on wrong answer
      await supabase.from('players').update({
        streak: 0,
        total_answered: supabase.raw('total_answered + 1')
      }).eq('id', playerId);
    }

    // Insert response
    const { data, error } = await supabase
      .from('responses')
      .insert({
        game_id: gameId,
        player_id: playerId,
        question_id: questionId,
        selected_answer: selectedAnswer,
        is_correct: isCorrect,
        time_taken_ms: timeTakenMs,
        points_earned: points,
        streak_bonus: streakBonus
      })
      .select()
      .single();
    if (error) throw error;

    return { ...data, points: points + streakBonus };
  },

  // Get leaderboard for a game
  async getLeaderboard(gameId) {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .order('score', { ascending: false });
    if (error) throw error;
    return data;
  }
};

// Export everything
window.NotesAreBoring = { Auth, QuizPacks, Games, Players, supabase };
