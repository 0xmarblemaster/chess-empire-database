/**
 * Supabase Data Layer
 * Replaces data.js localStorage with Supabase database queries
 */

// Check if Supabase client is available
if (typeof window.supabaseClient === 'undefined') {
    console.error('Supabase client not initialized. Please load supabase-client.js first.');
}

const supabaseData = {
    /**
     * STUDENTS
     */

    // Get all students
    async getStudents() {
        console.log('🔍 supabaseData.getStudents() - Fetching students from database...');
        const { data, error } = await window.supabaseClient
            .from('students')
            .select(`
                *,
                branch:branches(id, name, location),
                coach:coaches(id, first_name, last_name)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching students:', error);
            return [];
        }

        console.log('✅ supabaseData.getStudents() - Received', data?.length || 0, 'students from database');
        console.log('   First 3 students from DB:', data?.slice(0, 3).map(s => ({id: s.id, name: `${s.first_name} ${s.last_name}`})));

        // Transform to match data.js format
        const transformedStudents = data.map(student => ({
            id: student.id,
            firstName: student.first_name,
            lastName: student.last_name,
            age: student.age,
            dateOfBirth: student.date_of_birth,
            gender: student.gender,
            photoUrl: student.photo_url,
            branch: student.branch?.name || '',
            branchId: student.branch_id,
            coach: student.coach ? `${student.coach.first_name} ${student.coach.last_name}` : '',
            coachId: student.coach_id,
            razryad: student.razryad,
            status: student.status,
            currentLevel: student.current_level,
            currentLesson: student.current_lesson,
            totalLessons: student.total_lessons,
            parentName: student.parent_name,
            parentPhone: student.parent_phone,
            parentEmail: student.parent_email
        }));

        console.log('✅ supabaseData.getStudents() - Transformed', transformedStudents.length, 'students');
        return transformedStudents;
    },

    // Get student by ID
    async getStudentById(id) {
        const { data, error } = await window.supabaseClient
            .from('students')
            .select(`
                *,
                branch:branches(id, name, location),
                coach:coaches(id, first_name, last_name)
            `)
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching student:', error);
            return null;
        }

        return {
            id: data.id,
            firstName: data.first_name,
            lastName: data.last_name,
            age: data.age,
            dateOfBirth: data.date_of_birth,
            gender: data.gender,
            photoUrl: data.photo_url,
            branch: data.branch?.name || '',
            branchId: data.branch_id,
            coach: data.coach ? `${data.coach.first_name} ${data.coach.last_name}` : '',
            coachId: data.coach_id,
            razryad: data.razryad,
            status: data.status,
            currentLevel: data.current_level,
            currentLesson: data.current_lesson,
            totalLessons: data.total_lessons,
            parentName: data.parent_name,
            parentPhone: data.parent_phone,
            parentEmail: data.parent_email
        };
    },

    // Add new student
    async addStudent(studentData) {
        const { data, error } = await window.supabaseClient
            .from('students')
            .insert([{
                first_name: studentData.firstName,
                last_name: studentData.lastName,
                age: studentData.age,
                date_of_birth: studentData.dateOfBirth,
                gender: studentData.gender,
                photo_url: studentData.photoUrl,
                branch_id: studentData.branchId,
                coach_id: studentData.coachId,
                razryad: studentData.razryad || 'none',
                status: studentData.status || 'active',
                current_level: studentData.currentLevel || 1,
                current_lesson: studentData.currentLesson || 1,
                total_lessons: studentData.totalLessons || 120,
                parent_name: studentData.parentName,
                parent_phone: studentData.parentPhone,
                parent_email: studentData.parentEmail
            }])
            .select(`
                *,
                branch:branches(id, name, location),
                coach:coaches(id, first_name, last_name)
            `)
            .single();

        if (error) {
            console.error('Error adding student:', error);
            throw error;
        }

        // Transform to match data.js format
        return {
            id: data.id,
            firstName: data.first_name,
            lastName: data.last_name,
            age: data.age,
            dateOfBirth: data.date_of_birth,
            gender: data.gender,
            photoUrl: data.photo_url,
            branch: data.branch?.name || '',
            branchId: data.branch_id,
            coach: data.coach ? `${data.coach.first_name} ${data.coach.last_name}` : '',
            coachId: data.coach_id,
            razryad: data.razryad,
            status: data.status,
            currentLevel: data.current_level,
            currentLesson: data.current_lesson,
            totalLessons: data.total_lessons,
            parentName: data.parent_name,
            parentPhone: data.parent_phone,
            parentEmail: data.parent_email
        };
    },

    // Update student
    async updateStudent(id, studentData) {
        const { data, error } = await window.supabaseClient
            .from('students')
            .update({
                first_name: studentData.firstName,
                last_name: studentData.lastName,
                age: studentData.age,
                date_of_birth: studentData.dateOfBirth,
                gender: studentData.gender,
                photo_url: studentData.photoUrl,
                branch_id: studentData.branchId,
                coach_id: studentData.coachId,
                razryad: studentData.razryad,
                status: studentData.status,
                current_level: studentData.currentLevel,
                current_lesson: studentData.currentLesson,
                total_lessons: studentData.totalLessons,
                parent_name: studentData.parentName,
                parent_phone: studentData.parentPhone,
                parent_email: studentData.parentEmail
            })
            .eq('id', id)
            .select(`
                *,
                branch:branches(id, name, location),
                coach:coaches(id, first_name, last_name)
            `)
            .single();

        if (error) {
            console.error('Error updating student:', error);
            throw error;
        }

        // Transform to match data.js format
        return {
            id: data.id,
            firstName: data.first_name,
            lastName: data.last_name,
            age: data.age,
            dateOfBirth: data.date_of_birth,
            gender: data.gender,
            photoUrl: data.photo_url,
            branch: data.branch?.name || '',
            branchId: data.branch_id,
            coach: data.coach ? `${data.coach.first_name} ${data.coach.last_name}` : '',
            coachId: data.coach_id,
            razryad: data.razryad,
            status: data.status,
            currentLevel: data.current_level,
            currentLesson: data.current_lesson,
            totalLessons: data.total_lessons,
            parentName: data.parent_name,
            parentPhone: data.parent_phone,
            parentEmail: data.parent_email
        };
    },

    // Delete student
    async deleteStudent(id) {
        const { error } = await window.supabaseClient
            .from('students')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting student:', error);
            throw error;
        }

        return true;
    },

    /**
     * BRANCHES
     */

    async getBranches() {
        const { data, error } = await window.supabaseClient
            .from('branches')
            .select('*')
            .order('name');

        if (error) {
            console.error('Error fetching branches:', error);
            return [];
        }

        return data.map(branch => ({
            id: branch.id,
            name: branch.name,
            location: branch.location,
            phone: branch.phone,
            email: branch.email
        }));
    },

    async addBranch(branchData) {
        const { data, error } = await window.supabaseClient
            .from('branches')
            .insert([{
                name: branchData.name,
                location: branchData.location,
                phone: branchData.phone,
                email: branchData.email
            }])
            .select()
            .single();

        if (error) {
            console.error('Error adding branch:', error);
            throw error;
        }

        // Transform to match data.js format
        return {
            id: data.id,
            name: data.name,
            location: data.location,
            phone: data.phone,
            email: data.email
        };
    },

    async updateBranch(id, branchData) {
        const { data, error} = await window.supabaseClient
            .from('branches')
            .update({
                name: branchData.name,
                location: branchData.location,
                phone: branchData.phone,
                email: branchData.email
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating branch:', error);
            throw error;
        }

        // Transform to match data.js format
        return {
            id: data.id,
            name: data.name,
            location: data.location,
            phone: data.phone,
            email: data.email
        };
    },

    async deleteBranch(id) {
        const { error } = await window.supabaseClient
            .from('branches')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting branch:', error);
            throw error;
        }

        return true;
    },

    /**
     * COACHES
     */

    async getCoaches() {
        const { data, error } = await window.supabaseClient
            .from('coaches')
            .select(`
                *,
                branch:branches(id, name)
            `)
            .order('last_name');

        if (error) {
            console.error('Error fetching coaches:', error);
            return [];
        }

        return data.map(coach => ({
            id: coach.id,
            firstName: coach.first_name,
            lastName: coach.last_name,
            fullName: `${coach.first_name} ${coach.last_name}`,
            phone: coach.phone,
            email: coach.email,
            branch: coach.branch?.name || '',
            branchId: coach.branch_id
        }));
    },

    async addCoach(coachData) {
        const { data, error } = await window.supabaseClient
            .from('coaches')
            .insert([{
                first_name: coachData.firstName,
                last_name: coachData.lastName,
                phone: coachData.phone,
                email: coachData.email,
                branch_id: coachData.branchId
            }])
            .select(`
                *,
                branch:branches(id, name)
            `)
            .single();

        if (error) {
            console.error('Error adding coach:', error);
            throw error;
        }

        // Transform to match data.js format
        return {
            id: data.id,
            firstName: data.first_name,
            lastName: data.last_name,
            fullName: `${data.first_name} ${data.last_name}`,
            phone: data.phone,
            email: data.email,
            branch: data.branch?.name || '',
            branchId: data.branch_id
        };
    },

    async updateCoach(id, coachData) {
        const { data, error } = await window.supabaseClient
            .from('coaches')
            .update({
                first_name: coachData.firstName,
                last_name: coachData.lastName,
                phone: coachData.phone,
                email: coachData.email,
                branch_id: coachData.branchId
            })
            .eq('id', id)
            .select(`
                *,
                branch:branches(id, name)
            `)
            .single();

        if (error) {
            console.error('Error updating coach:', error);
            throw error;
        }

        // Transform to match data.js format
        return {
            id: data.id,
            firstName: data.first_name,
            lastName: data.last_name,
            fullName: `${data.first_name} ${data.last_name}`,
            phone: data.phone,
            email: data.email,
            branch: data.branch?.name || '',
            branchId: data.branch_id
        };
    },

    async deleteCoach(id) {
        const { error } = await window.supabaseClient
            .from('coaches')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting coach:', error);
            throw error;
        }

        return true;
    },

    /**
     * PHOTO UPLOAD
     */

    // Upload student photo to Supabase Storage
    async uploadStudentPhoto(file, studentId) {
        if (!file) {
            console.error('No file provided for upload');
            return null;
        }

        // Generate unique filename with student ID and timestamp
        const fileExt = file.name.split('.').pop();
        const fileName = `${studentId}_${Date.now()}.${fileExt}`;
        const filePath = `students/${fileName}`;

        console.log('📤 Uploading photo to Supabase Storage:', filePath);

        const { data, error } = await window.supabaseClient
            .storage
            .from('student-photos')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Error uploading photo:', error);
            throw error;
        }

        // Get public URL for the uploaded file
        const { data: urlData } = window.supabaseClient
            .storage
            .from('student-photos')
            .getPublicUrl(filePath);

        console.log('✅ Photo uploaded successfully:', urlData.publicUrl);
        return urlData.publicUrl;
    },

    // Delete student photo from Supabase Storage
    async deleteStudentPhoto(photoUrl) {
        if (!photoUrl) return true;

        try {
            // Extract file path from URL
            // URL format: https://xxx.supabase.co/storage/v1/object/public/student-photos/students/filename.jpg
            const urlParts = photoUrl.split('/student-photos/');
            if (urlParts.length < 2) {
                console.warn('Could not parse photo URL for deletion:', photoUrl);
                return true;
            }

            const filePath = urlParts[1];
            console.log('🗑️ Deleting photo from storage:', filePath);

            const { error } = await window.supabaseClient
                .storage
                .from('student-photos')
                .remove([filePath]);

            if (error) {
                console.error('Error deleting photo:', error);
                // Don't throw - photo deletion failure shouldn't block other operations
                return false;
            }

            console.log('✅ Photo deleted successfully');
            return true;
        } catch (err) {
            console.error('Error in deleteStudentPhoto:', err);
            return false;
        }
    },

    /**
     * SEARCH
     */

    async searchStudents(query) {
        const { data, error } = await window.supabaseClient
            .from('students')
            .select(`
                *,
                branch:branches(name),
                coach:coaches(first_name, last_name)
            `)
            .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
            .limit(50);

        if (error) {
            console.error('Error searching students:', error);
            return [];
        }

        const results = data.map(student => ({
            id: student.id,
            firstName: student.first_name,
            lastName: student.last_name,
            branch: student.branch?.name || '',
            coach: student.coach ? `${student.coach.first_name} ${student.coach.last_name}` : '',
            razryad: student.razryad,
            status: student.status
        }));

        // Prioritized search sorting:
        // 1. Surname starts with query
        // 2. First name starts with query
        // 3. Contains query anywhere
        const queryLower = query.toLowerCase();

        return results.sort((a, b) => {
            const aLastLower = a.lastName.toLowerCase();
            const bLastLower = b.lastName.toLowerCase();
            const aFirstLower = a.firstName.toLowerCase();
            const bFirstLower = b.firstName.toLowerCase();

            // Priority 1: Surname starts with query
            const aLastStarts = aLastLower.startsWith(queryLower);
            const bLastStarts = bLastLower.startsWith(queryLower);

            if (aLastStarts && !bLastStarts) return -1;
            if (!aLastStarts && bLastStarts) return 1;

            // If both surnames start with query, sort alphabetically by surname
            if (aLastStarts && bLastStarts) {
                return aLastLower.localeCompare(bLastLower);
            }

            // Priority 2: First name starts with query
            const aFirstStarts = aFirstLower.startsWith(queryLower);
            const bFirstStarts = bFirstLower.startsWith(queryLower);

            if (aFirstStarts && !bFirstStarts) return -1;
            if (!aFirstStarts && bFirstStarts) return 1;

            // If both first names start with query, sort alphabetically by first name
            if (aFirstStarts && bFirstStarts) {
                return aFirstLower.localeCompare(bFirstLower);
            }

            // Priority 3: Contains query anywhere (both are equal priority here)
            // Sort alphabetically by last name, then first name
            const lastNameCompare = aLastLower.localeCompare(bLastLower);
            if (lastNameCompare !== 0) return lastNameCompare;

            return aFirstLower.localeCompare(bFirstLower);
        }).slice(0, 10);
    },

    // ============================================
    // STUDENT RATINGS
    // ============================================

    // Get all rating history for a student
    async getStudentRatings(studentId) {
        const { data, error } = await window.supabaseClient
            .from('student_ratings')
            .select('*')
            .eq('student_id', studentId)
            .order('rating_date', { ascending: false });

        if (error) {
            console.error('Error fetching student ratings:', error);
            return [];
        }

        return data.map(r => ({
            id: r.id,
            studentId: r.student_id,
            rating: r.rating,
            ratingDate: r.rating_date,
            source: r.source,
            notes: r.notes,
            createdAt: r.created_at
        }));
    },

    // Get current (latest) rating for a student
    async getCurrentRating(studentId) {
        const { data, error } = await window.supabaseClient
            .from('student_current_ratings')
            .select('*')
            .eq('student_id', studentId)
            .single();

        if (error) {
            // No rating found is not an error - return defaults
            return { rating: 0, league: 'Beginner', leagueTier: 'none', ratingDate: null };
        }

        return {
            studentId: data.student_id,
            rating: data.rating,
            ratingDate: data.rating_date,
            league: data.league,
            leagueTier: data.league_tier
        };
    },

    // Add a new rating entry for a student
    async addStudentRating(studentId, rating, source = 'manual', notes = '') {
        const { data, error } = await window.supabaseClient
            .from('student_ratings')
            .insert([{
                student_id: studentId,
                rating: rating,
                source: source,
                notes: notes
            }])
            .select()
            .single();

        if (error) {
            console.error('Error adding student rating:', error);
            throw error;
        }

        return {
            id: data.id,
            studentId: data.student_id,
            rating: data.rating,
            ratingDate: data.rating_date,
            source: data.source,
            notes: data.notes
        };
    },

    // Bulk import ratings (from CSV)
    async bulkImportRatings(ratingsArray) {
        // ratingsArray: [{studentId, rating, ratingDate?, source?}]
        const insertData = ratingsArray.map(r => ({
            student_id: r.studentId,
            rating: r.rating,
            rating_date: r.ratingDate || new Date().toISOString().split('T')[0],
            source: r.source || 'csv_import',
            notes: r.notes || ''
        }));

        const { data, error } = await window.supabaseClient
            .from('student_ratings')
            .insert(insertData)
            .select();

        if (error) {
            console.error('Error bulk importing ratings:', error);
            throw error;
        }

        return data.length;
    },

    // Delete a rating entry
    async deleteStudentRating(ratingId) {
        const { error } = await window.supabaseClient
            .from('student_ratings')
            .delete()
            .eq('id', ratingId);

        if (error) {
            console.error('Error deleting rating:', error);
            throw error;
        }

        return true;
    },

    // ============================================
    // BOT BATTLES
    // ============================================

    // Get all bot battles for a student
    async getStudentBotBattles(studentId) {
        const { data, error } = await window.supabaseClient
            .from('bot_battles')
            .select('*')
            .eq('student_id', studentId)
            .order('bot_rating', { ascending: true });

        if (error) {
            console.error('Error fetching bot battles:', error);
            return [];
        }

        return data.map(b => ({
            id: b.id,
            studentId: b.student_id,
            botName: b.bot_name,
            botRating: b.bot_rating,
            defeatedAt: b.defeated_at,
            timeControl: b.time_control,
            notes: b.notes
        }));
    },

    // Get bot battle progress summary for a student
    async getStudentBotProgress(studentId) {
        const { data, error } = await window.supabaseClient
            .from('student_bot_progress')
            .select('*')
            .eq('student_id', studentId)
            .single();

        if (error) {
            // No progress found - return defaults
            return { botsDefeated: 0, highestBotRating: 0, defeatedBots: [] };
        }

        return {
            botsDefeated: data.bots_defeated,
            highestBotRating: data.highest_bot_rating,
            defeatedBots: data.defeated_bots || []
        };
    },

    // Add a bot battle win
    async addBotBattleWin(studentId, botName, botRating, timeControl = null, notes = '') {
        const { data, error } = await window.supabaseClient
            .from('bot_battles')
            .insert([{
                student_id: studentId,
                bot_name: botName,
                bot_rating: botRating,
                time_control: timeControl,
                notes: notes
            }])
            .select()
            .single();

        if (error) {
            // Check if it's a duplicate error (already defeated this bot)
            if (error.code === '23505') {
                console.warn('Bot already defeated:', botName);
                return null;
            }
            console.error('Error adding bot battle:', error);
            throw error;
        }

        return {
            id: data.id,
            studentId: data.student_id,
            botName: data.bot_name,
            botRating: data.bot_rating,
            defeatedAt: data.defeated_at
        };
    },

    // Remove a bot battle win
    async removeBotBattleWin(studentId, botName) {
        const { error } = await window.supabaseClient
            .from('bot_battles')
            .delete()
            .eq('student_id', studentId)
            .eq('bot_name', botName);

        if (error) {
            console.error('Error removing bot battle:', error);
            throw error;
        }

        return true;
    },

    // ============================================
    // SURVIVAL SCORES
    // ============================================

    // Get all survival scores for a student
    async getStudentSurvivalScores(studentId, mode = null) {
        let query = window.supabaseClient
            .from('survival_scores')
            .select('*')
            .eq('student_id', studentId)
            .order('score', { ascending: false });

        if (mode) {
            query = query.eq('mode', mode);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching survival scores:', error);
            return [];
        }

        return data.map(s => ({
            id: s.id,
            studentId: s.student_id,
            score: s.score,
            mode: s.mode,
            achievedAt: s.achieved_at,
            notes: s.notes
        }));
    },

    // Get best survival score for a student
    async getBestSurvivalScore(studentId, mode = 'survival_3') {
        const { data, error } = await window.supabaseClient
            .from('student_best_survival')
            .select('*')
            .eq('student_id', studentId)
            .eq('mode', mode)
            .single();

        if (error) {
            return { bestScore: 0, achievedAt: null };
        }

        return {
            bestScore: data.best_score,
            achievedAt: data.achieved_at
        };
    },

    // Add a new survival score
    async addSurvivalScore(studentId, score, mode = 'survival_3', notes = '') {
        const { data, error } = await window.supabaseClient
            .from('survival_scores')
            .insert([{
                student_id: studentId,
                score: score,
                mode: mode,
                notes: notes
            }])
            .select()
            .single();

        if (error) {
            console.error('Error adding survival score:', error);
            throw error;
        }

        return {
            id: data.id,
            studentId: data.student_id,
            score: data.score,
            mode: data.mode,
            achievedAt: data.achieved_at
        };
    },

    // Delete a survival score
    async deleteSurvivalScore(scoreId) {
        const { error } = await window.supabaseClient
            .from('survival_scores')
            .delete()
            .eq('id', scoreId);

        if (error) {
            console.error('Error deleting survival score:', error);
            throw error;
        }

        return true;
    },

    // ============================================
    // RANKINGS
    // ============================================

    // Get student's ranking within their branch
    async getStudentBranchRank(studentId) {
        const { data, error } = await window.supabaseClient
            .rpc('get_student_branch_rank', { p_student_id: studentId });

        if (error) {
            console.error('Error fetching branch rank:', error);
            return { totalInBranch: 0, rankInBranch: 0, percentile: 0 };
        }

        const result = data?.[0] || {};
        return {
            totalInBranch: result.total_in_branch || 0,
            rankInBranch: result.rank_in_branch || 0,
            percentile: result.percentile || 0
        };
    },

    // Get student's school-wide ranking
    async getStudentSchoolRank(studentId) {
        const { data, error } = await window.supabaseClient
            .rpc('get_student_school_rank', { p_student_id: studentId });

        if (error) {
            console.error('Error fetching school rank:', error);
            return { totalInSchool: 0, rankInSchool: 0, percentile: 0 };
        }

        const result = data?.[0] || {};
        return {
            totalInSchool: result.total_in_school || 0,
            rankInSchool: result.rank_in_school || 0,
            percentile: result.percentile || 0
        };
    },

    // Get student's survival mode ranking
    async getStudentSurvivalRank(studentId, mode = 'survival_3') {
        const { data, error } = await window.supabaseClient
            .rpc('get_student_survival_rank', { p_student_id: studentId, p_mode: mode });

        if (error) {
            console.error('Error fetching survival rank:', error);
            return { totalPlayers: 0, rank: 0, percentile: 0, bestScore: 0 };
        }

        const result = data?.[0] || {};
        return {
            totalPlayers: result.total_players || 0,
            rank: result.rank || 0,
            percentile: result.percentile || 0,
            bestScore: result.best_score || 0
        };
    },

    // Get all rankings for a student (convenience method)
    async getStudentRankings(studentId) {
        const [branchRank, schoolRank, survivalRank, branchLevelRank, schoolLevelRank] = await Promise.all([
            this.getStudentBranchRank(studentId),
            this.getStudentSchoolRank(studentId),
            this.getStudentSurvivalRank(studentId),
            this.getStudentBranchLevelRank(studentId),
            this.getStudentSchoolLevelRank(studentId)
        ]);

        return {
            branch: branchRank,
            school: schoolRank,
            survival: survivalRank,
            branchLevel: branchLevelRank,
            schoolLevel: schoolLevelRank
        };
    },

    // Get student's LEVEL-based ranking within their branch
    // Returns rank position (e.g., 5 out of 70) based on Level and Lesson
    async getStudentBranchLevelRank(studentId) {
        const { data, error } = await window.supabaseClient
            .rpc('get_student_branch_level_rank', { p_student_id: studentId });

        if (error) {
            console.error('Error fetching branch level rank:', error);
            return { totalInBranch: 0, rankInBranch: 0, currentLevel: 0, currentLesson: 0 };
        }

        const result = data?.[0] || {};
        return {
            totalInBranch: result.total_in_branch || 0,
            rankInBranch: result.rank_in_branch || 0,
            currentLevel: result.current_level || 0,
            currentLesson: result.current_lesson || 0
        };
    },

    // Get student's LEVEL-based school-wide ranking
    // Returns rank position (e.g., 50 out of 618) based on Level and Lesson
    async getStudentSchoolLevelRank(studentId) {
        const { data, error } = await window.supabaseClient
            .rpc('get_student_school_level_rank', { p_student_id: studentId });

        if (error) {
            console.error('Error fetching school level rank:', error);
            return { totalInSchool: 0, rankInSchool: 0, currentLevel: 0, currentLesson: 0 };
        }

        const result = data?.[0] || {};
        return {
            totalInSchool: result.total_in_school || 0,
            rankInSchool: result.rank_in_school || 0,
            currentLevel: result.current_level || 0,
            currentLesson: result.current_lesson || 0
        };
    },

    // ============================================
    // ACHIEVEMENTS
    // ============================================

    // Get all achievement definitions
    async getAchievements() {
        const { data, error } = await window.supabaseClient
            .from('achievements')
            .select('*')
            .order('sort_order');

        if (error) {
            console.error('Error fetching achievements:', error);
            return [];
        }

        return data.map(a => ({
            id: a.id,
            code: a.code,
            nameEn: a.name_en,
            nameRu: a.name_ru,
            nameKk: a.name_kk,
            descriptionEn: a.description_en,
            descriptionRu: a.description_ru,
            descriptionKk: a.description_kk,
            category: a.category,
            icon: a.icon,
            color: a.color,
            tier: a.tier,
            thresholdValue: a.threshold_value,
            sortOrder: a.sort_order
        }));
    },

    // Get achievements earned by a student
    async getStudentAchievements(studentId) {
        const { data, error } = await window.supabaseClient
            .from('student_achievements')
            .select(`
                *,
                achievement:achievements(*)
            `)
            .eq('student_id', studentId)
            .order('earned_at', { ascending: false });

        if (error) {
            console.error('Error fetching student achievements:', error);
            return [];
        }

        return data.map(sa => ({
            id: sa.id,
            studentId: sa.student_id,
            achievementId: sa.achievement_id,
            earnedAt: sa.earned_at,
            notes: sa.notes,
            achievement: sa.achievement ? {
                code: sa.achievement.code,
                nameEn: sa.achievement.name_en,
                nameRu: sa.achievement.name_ru,
                nameKk: sa.achievement.name_kk,
                category: sa.achievement.category,
                icon: sa.achievement.icon,
                tier: sa.achievement.tier,
                thresholdValue: sa.achievement.threshold_value
            } : null
        }));
    },

    // Award an achievement to a student
    async awardAchievement(studentId, achievementCode, notes = '') {
        // First get the achievement ID
        const { data: achievement, error: fetchError } = await window.supabaseClient
            .from('achievements')
            .select('id')
            .eq('code', achievementCode)
            .single();

        if (fetchError || !achievement) {
            console.error('Achievement not found:', achievementCode);
            return null;
        }

        // Insert the student achievement
        const { data, error } = await window.supabaseClient
            .from('student_achievements')
            .insert([{
                student_id: studentId,
                achievement_id: achievement.id,
                notes: notes
            }])
            .select(`
                *,
                achievement:achievements(*)
            `)
            .single();

        if (error) {
            // Duplicate - already has this achievement
            if (error.code === '23505') {
                console.warn('Student already has achievement:', achievementCode);
                return null;
            }
            console.error('Error awarding achievement:', error);
            throw error;
        }

        return {
            id: data.id,
            studentId: data.student_id,
            achievementId: data.achievement_id,
            earnedAt: data.earned_at,
            achievement: data.achievement ? {
                code: data.achievement.code,
                nameEn: data.achievement.name_en,
                nameRu: data.achievement.name_ru,
                icon: data.achievement.icon,
                tier: data.achievement.tier
            } : null
        };
    },

    // Remove an achievement from a student
    async removeAchievement(studentId, achievementCode) {
        // First get the achievement ID
        const { data: achievement } = await window.supabaseClient
            .from('achievements')
            .select('id')
            .eq('code', achievementCode)
            .single();

        if (!achievement) return true;

        const { error } = await window.supabaseClient
            .from('student_achievements')
            .delete()
            .eq('student_id', studentId)
            .eq('achievement_id', achievement.id);

        if (error) {
            console.error('Error removing achievement:', error);
            throw error;
        }

        return true;
    },

    // ============================================
    // LEADERBOARDS
    // ============================================

    // Get survival mode leaderboard
    async getSurvivalLeaderboard(mode = 'survival_3', limit = 20) {
        const { data, error } = await window.supabaseClient
            .from('student_best_survival')
            .select(`
                student_id,
                best_score,
                achieved_at
            `)
            .eq('mode', mode)
            .order('best_score', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching survival leaderboard:', error);
            return [];
        }

        // Fetch student details for each entry
        const studentIds = data.map(d => d.student_id);
        const { data: students } = await window.supabaseClient
            .from('students')
            .select('id, first_name, last_name, branch:branches(name)')
            .in('id', studentIds);

        const studentMap = new Map(students?.map(s => [s.id, s]) || []);

        return data.map((entry, index) => {
            const student = studentMap.get(entry.student_id);
            return {
                rank: index + 1,
                studentId: entry.student_id,
                firstName: student?.first_name || '',
                lastName: student?.last_name || '',
                branch: student?.branch?.name || '',
                bestScore: entry.best_score,
                achievedAt: entry.achieved_at
            };
        });
    },

    // Get rating leaderboard
    async getRatingLeaderboard(branchId = null, limit = 20) {
        let query = window.supabaseClient
            .from('student_current_ratings')
            .select('*')
            .order('rating', { ascending: false })
            .limit(limit);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching rating leaderboard:', error);
            return [];
        }

        // Fetch student details
        const studentIds = data.map(d => d.student_id);
        let studentsQuery = window.supabaseClient
            .from('students')
            .select('id, first_name, last_name, branch_id, branch:branches(name)')
            .in('id', studentIds);

        if (branchId) {
            studentsQuery = studentsQuery.eq('branch_id', branchId);
        }

        const { data: students } = await studentsQuery;
        const studentMap = new Map(students?.map(s => [s.id, s]) || []);

        return data
            .filter(entry => studentMap.has(entry.student_id))
            .map((entry, index) => {
                const student = studentMap.get(entry.student_id);
                return {
                    rank: index + 1,
                    studentId: entry.student_id,
                    firstName: student?.first_name || '',
                    lastName: student?.last_name || '',
                    branch: student?.branch?.name || '',
                    rating: entry.rating,
                    league: entry.league,
                    leagueTier: entry.league_tier
                };
            });
    },

    // Get bot battle leaderboard (most bots defeated)
    async getBotBattleLeaderboard(limit = 20) {
        const { data, error } = await window.supabaseClient
            .from('student_bot_progress')
            .select('*')
            .order('bots_defeated', { ascending: false })
            .order('highest_bot_rating', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching bot battle leaderboard:', error);
            return [];
        }

        // Fetch student details
        const studentIds = data.map(d => d.student_id);
        const { data: students } = await window.supabaseClient
            .from('students')
            .select('id, first_name, last_name, branch:branches(name)')
            .in('id', studentIds);

        const studentMap = new Map(students?.map(s => [s.id, s]) || []);

        return data.map((entry, index) => {
            const student = studentMap.get(entry.student_id);
            return {
                rank: index + 1,
                studentId: entry.student_id,
                firstName: student?.first_name || '',
                lastName: student?.last_name || '',
                branch: student?.branch?.name || '',
                botsDefeated: entry.bots_defeated,
                highestBotRating: entry.highest_bot_rating,
                defeatedBots: entry.defeated_bots || []
            };
        });
    },

    // ============================================
    // COMPREHENSIVE STUDENT DATA (for profile page)
    // ============================================

    // Get all ranking/achievement data for a student
    async getStudentFullProfile(studentId) {
        const [
            basicInfo,
            currentRating,
            ratingHistory,
            botBattles,
            botProgress,
            survivalScores,
            bestSurvival,
            rankings,
            achievements
        ] = await Promise.all([
            this.getStudentById(studentId),
            this.getCurrentRating(studentId),
            this.getStudentRatings(studentId),
            this.getStudentBotBattles(studentId),
            this.getStudentBotProgress(studentId),
            this.getStudentSurvivalScores(studentId),
            this.getBestSurvivalScore(studentId),
            this.getStudentRankings(studentId),
            this.getStudentAchievements(studentId)
        ]);

        return {
            ...basicInfo,
            rating: currentRating,
            ratingHistory: ratingHistory.slice(0, 10), // Last 10 ratings
            botBattles,
            botProgress,
            survivalScores: survivalScores.slice(0, 10), // Last 10 scores
            bestSurvival,
            rankings,
            achievements
        };
    }
};

// Make it available globally
window.supabaseData = supabaseData;
