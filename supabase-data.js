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
        const { data, error } = await window.supabaseClient
            .from('students')
            .select(`
                id, first_name, last_name, age, date_of_birth, gender,
                photo_url, branch_id, coach_id, razryad, status,
                current_level, current_lesson, total_lessons,
                parent_name, parent_phone, parent_email,
                branch:branches(id, name, location),
                coach:coaches(id, first_name, last_name)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching students:', error);
            return [];
        }

        // Transform to match data.js format
        return data.map(student => ({
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
            photoUrl: coach.photo_url,
            bio: coach.bio,
            instagramUrl: coach.instagram_url,
            whatsappUrl: coach.whatsapp_url,
            branch: coach.branch?.name || '',
            branchName: coach.branch?.name || '',
            branchId: coach.branch_id
        }));
    },

    async getCoachById(coachId) {
        const { data, error } = await window.supabaseClient
            .from('coaches')
            .select(`
                *,
                branch:branches(id, name)
            `)
            .eq('id', coachId)
            .single();

        if (error) {
            console.error('Error fetching coach by ID:', error);
            return null;
        }

        return {
            id: data.id,
            firstName: data.first_name,
            lastName: data.last_name,
            fullName: `${data.first_name} ${data.last_name}`,
            phone: data.phone,
            email: data.email,
            photoUrl: data.photo_url,
            bio: data.bio,
            instagramUrl: data.instagram_url,
            whatsappUrl: data.whatsapp_url,
            branch: data.branch?.name || '',
            branchName: data.branch?.name || '',
            branchId: data.branch_id
        };
    },

    async searchCoaches(searchTerm) {
        const { data, error } = await window.supabaseClient
            .from('coaches')
            .select(`
                *,
                branch:branches(id, name)
            `)
            .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`)
            .order('last_name')
            .limit(5);

        if (error) {
            console.error('Error searching coaches:', error);
            return [];
        }

        return data.map(coach => ({
            id: coach.id,
            firstName: coach.first_name,
            lastName: coach.last_name,
            fullName: `${coach.first_name} ${coach.last_name}`,
            phone: coach.phone,
            email: coach.email,
            photoUrl: coach.photo_url,
            bio: coach.bio,
            instagramUrl: coach.instagram_url,
            whatsappUrl: coach.whatsapp_url,
            branch: coach.branch?.name || '',
            branchName: coach.branch?.name || '',
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
                photo_url: coachData.photoUrl || null,
                bio: coachData.bio || null,
                instagram_url: coachData.instagramUrl || null,
                whatsapp_url: coachData.whatsappUrl || null,
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
            photoUrl: data.photo_url,
            bio: data.bio,
            instagramUrl: data.instagram_url,
            whatsappUrl: data.whatsapp_url,
            branch: data.branch?.name || '',
            branchId: data.branch_id
        };
    },

    async updateCoach(id, coachData) {
        const updateData = {
            first_name: coachData.firstName,
            last_name: coachData.lastName,
            phone: coachData.phone,
            email: coachData.email,
            branch_id: coachData.branchId
        };

        // Only include optional fields if they are provided
        if (coachData.photoUrl !== undefined) updateData.photo_url = coachData.photoUrl;
        if (coachData.bio !== undefined) updateData.bio = coachData.bio;
        if (coachData.instagramUrl !== undefined) updateData.instagram_url = coachData.instagramUrl;
        if (coachData.whatsappUrl !== undefined) updateData.whatsapp_url = coachData.whatsappUrl;

        const { data, error } = await window.supabaseClient
            .from('coaches')
            .update(updateData)
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
            photoUrl: data.photo_url,
            bio: data.bio,
            instagramUrl: data.instagram_url,
            whatsappUrl: data.whatsapp_url,
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
            console.log('Deleting photo from storage:', filePath);

            const { error } = await window.supabaseClient
                .storage
                .from('student-photos')
                .remove([filePath]);

            if (error) {
                console.error('Error deleting photo:', error);
                // Don't throw - photo deletion failure shouldn't block other operations
                return false;
            }

            console.log('Photo deleted successfully');
            return true;
        } catch (err) {
            console.error('Error in deleteStudentPhoto:', err);
            return false;
        }
    },

    // Upload coach photo to Supabase Storage
    async uploadCoachPhoto(file, coachId) {
        if (!file) {
            console.error('No file provided for upload');
            return null;
        }

        // Generate unique filename with coach ID and timestamp
        const fileExt = file.name.split('.').pop();
        const fileName = `${coachId}_${Date.now()}.${fileExt}`;
        const filePath = `coaches/${fileName}`;

        console.log('Uploading coach photo to Supabase Storage:', filePath);

        const { data, error } = await window.supabaseClient
            .storage
            .from('coach-photos')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Error uploading coach photo:', error);
            throw error;
        }

        // Get public URL for the uploaded file
        const { data: urlData } = window.supabaseClient
            .storage
            .from('coach-photos')
            .getPublicUrl(filePath);

        console.log('Coach photo uploaded successfully:', urlData.publicUrl);
        return urlData.publicUrl;
    },

    // Delete coach photo from Supabase Storage
    async deleteCoachPhoto(photoUrl) {
        if (!photoUrl) return true;

        try {
            // Extract file path from URL
            const urlParts = photoUrl.split('/coach-photos/');
            if (urlParts.length < 2) {
                console.warn('Could not parse coach photo URL for deletion:', photoUrl);
                return true;
            }

            const filePath = urlParts[1];
            console.log('Deleting coach photo from storage:', filePath);

            const { error } = await window.supabaseClient
                .storage
                .from('coach-photos')
                .remove([filePath]);

            if (error) {
                console.error('Error deleting coach photo:', error);
                return false;
            }

            console.log('Coach photo deleted successfully');
            return true;
        } catch (err) {
            console.error('Error in deleteCoachPhoto:', err);
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

    // Helper function to calculate league from rating
    _calculateLeague(rating) {
        if (rating >= 1200) return { league: 'League A+', leagueTier: 'diamond' };
        if (rating >= 900) return { league: 'League A', leagueTier: 'gold' };
        if (rating >= 500) return { league: 'League B', leagueTier: 'silver' };
        if (rating >= 0) return { league: 'League C', leagueTier: 'bronze' };
        return { league: 'Beginner', leagueTier: 'none' };
    },

    // Get current (latest) rating for a student
    async getCurrentRating(studentId) {
        try {
            // Query student_ratings table directly instead of view to avoid 406 errors
            const { data, error } = await window.supabaseClient
                .from('student_ratings')
                .select('student_id, rating, rating_date')
                .eq('student_id', studentId)
                .order('rating_date', { ascending: false })
                .limit(1);

            if (error || !data || data.length === 0) {
                // No rating found - return defaults silently
                return { rating: 0, league: 'Beginner', leagueTier: 'none', ratingDate: null };
            }

            const row = data[0];
            const { league, leagueTier } = this._calculateLeague(row.rating);

            return {
                studentId: row.student_id,
                rating: row.rating,
                ratingDate: row.rating_date,
                league: league,
                leagueTier: leagueTier
            };
        } catch (e) {
            // No rating or error - return defaults silently
            return { rating: 0, league: 'Beginner', leagueTier: 'none', ratingDate: null };
        }
    },

    // Add or update a rating entry for a student (upsert - one rating per student per day)
    async addStudentRating(studentId, rating, source = 'manual', notes = '') {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

        const { data, error } = await window.supabaseClient
            .from('student_ratings')
            .upsert({
                student_id: studentId,
                rating: rating,
                rating_date: today,
                source: source,
                notes: notes
            })
            .select()
            .single();

        if (error) {
            console.error('Error adding/updating student rating:', error);
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

    // Get all current ratings (latest rating for each student) - much more efficient than individual queries
    async getAllCurrentRatings() {
        try {
            // Get all ratings ordered by date descending
            const { data, error } = await window.supabaseClient
                .from('student_ratings')
                .select('student_id, rating, rating_date')
                .order('rating_date', { ascending: false });

            if (error) {
                console.error('Error fetching all ratings:', error);
                return new Map();
            }

            // Build a map of student_id -> latest rating (first occurrence since sorted by date desc)
            const ratingsMap = new Map();
            for (const row of data) {
                if (!ratingsMap.has(row.student_id)) {
                    const { league, leagueTier } = this._calculateLeague(row.rating);
                    ratingsMap.set(row.student_id, {
                        studentId: row.student_id,
                        rating: row.rating,
                        ratingDate: row.rating_date,
                        league: league,
                        leagueTier: leagueTier
                    });
                }
            }

            return ratingsMap;
        } catch (e) {
            console.error('Error in getAllCurrentRatings:', e);
            return new Map();
        }
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
        try {
            const { data, error } = await window.supabaseClient
                .from('student_bot_progress')
                .select('*')
                .eq('student_id', studentId)
                .maybeSingle();

            if (error || !data) {
                // No progress found - return defaults
                return { botsDefeated: 0, highestBotRating: 0, defeatedBots: [] };
            }

            return {
                botsDefeated: data.bots_defeated,
                highestBotRating: data.highest_bot_rating,
                defeatedBots: data.defeated_bots || []
            };
        } catch (err) {
            // Silently handle missing table/view
            return { botsDefeated: 0, highestBotRating: 0, defeatedBots: [] };
        }
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
        try {
            let query = window.supabaseClient
                .from('survival_scores')
                .select('*')
                .eq('student_id', studentId)
                .order('score', { ascending: false });

            if (mode) {
                query = query.eq('mode', mode);
            }

            const { data, error } = await query;

            if (error || !data) {
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
        } catch (err) {
            // Silently handle missing table
            return [];
        }
    },

    // Get best survival score for a student
    async getBestSurvivalScore(studentId, mode = 'survival_3') {
        try {
            const { data, error } = await window.supabaseClient
                .from('student_best_survival')
                .select('*')
                .eq('student_id', studentId)
                .eq('mode', mode)
                .maybeSingle();

            if (error || !data) {
                return { bestScore: 0, achievedAt: null };
            }

            return {
                bestScore: data.best_score,
                achievedAt: data.achieved_at
            };
        } catch (err) {
            // Silently handle missing table/view
            return { bestScore: 0, achievedAt: null };
        }
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
    // TODO: Implement get_student_branch_rank() function in database
    async getStudentBranchRank(studentId) {
        // Function not implemented in database yet - return defaults
        return { totalInBranch: 0, rankInBranch: 0, percentile: 0 };
    },

    // Get student's school-wide ranking
    // TODO: Implement get_student_school_rank() function in database
    async getStudentSchoolRank(studentId) {
        // Function not implemented in database yet - return defaults
        return { totalInSchool: 0, rankInSchool: 0, percentile: 0 };
    },

    // Get student's survival mode ranking
    // TODO: Implement get_student_survival_rank() function in database
    async getStudentSurvivalRank(studentId, mode = 'survival_3') {
        // Function not implemented in database yet - return defaults
        return { totalPlayers: 0, rank: 0, percentile: 0, bestScore: 0 };
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
    // PUZZLE SCORE RANKINGS
    // ============================================

    // Get student's PUZZLE SCORE ranking within their branch
    // Returns rank position based on best puzzle/survival score
    async getStudentBranchPuzzleRank(studentId) {
        try {
            const { data, error } = await window.supabaseClient
                .rpc('get_student_branch_puzzle_rank', { p_student_id: studentId });

            if (error) {
                // Silently handle 406 (function not found) - not a critical error
                if (error.code !== '42883' && error.message?.indexOf('406') === -1) {
                    console.error('Error fetching branch puzzle rank:', error);
                }
                return { totalInBranch: 0, rankInBranch: 0, bestScore: 0 };
            }

            const result = data?.[0] || {};
            return {
                totalInBranch: result.total_in_branch || 0,
                rankInBranch: result.rank_in_branch || 0,
                bestScore: result.best_score || 0
            };
        } catch (err) {
            // Silently fail - function may not exist yet
            return { totalInBranch: 0, rankInBranch: 0, bestScore: 0 };
        }
    },

    // Get student's PUZZLE SCORE school-wide ranking
    // Returns rank position based on best puzzle/survival score
    async getStudentSchoolPuzzleRank(studentId) {
        try {
            const { data, error } = await window.supabaseClient
                .rpc('get_student_school_puzzle_rank', { p_student_id: studentId });

            if (error) {
                // Silently handle 406 (function not found) - not a critical error
                if (error.code !== '42883' && error.message?.indexOf('406') === -1) {
                    console.error('Error fetching school puzzle rank:', error);
                }
                return { totalInSchool: 0, rankInSchool: 0, bestScore: 0 };
            }

            const result = data?.[0] || {};
            return {
                totalInSchool: result.total_in_school || 0,
                rankInSchool: result.rank_in_school || 0,
                bestScore: result.best_score || 0
            };
        } catch (err) {
            // Silently fail - function may not exist yet
            return { totalInSchool: 0, rankInSchool: 0, bestScore: 0 };
        }
    },

    // Get both puzzle rankings at once (convenience method)
    async getStudentPuzzleRankings(studentId) {
        const [branchPuzzle, schoolPuzzle] = await Promise.all([
            this.getStudentBranchPuzzleRank(studentId),
            this.getStudentSchoolPuzzleRank(studentId)
        ]);

        return {
            branchPuzzle,
            schoolPuzzle
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
    // TODO: Implement student_achievements table in database
    async getStudentAchievements(studentId) {
        // Table not implemented in database yet - return empty array
        return [];
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
        try {
            // Query student_ratings table directly and get latest rating per student
            // Using RPC or manual distinct logic since we can't use DISTINCT ON via REST API
            const { data: allRatings, error } = await window.supabaseClient
                .from('student_ratings')
                .select('student_id, rating, rating_date')
                .order('rating_date', { ascending: false });

            if (error || !allRatings) {
                return [];
            }

            // Get latest rating per student (manual DISTINCT ON)
            const latestRatings = new Map();
            for (const r of allRatings) {
                if (!latestRatings.has(r.student_id)) {
                    latestRatings.set(r.student_id, r);
                }
            }

            // Sort by rating descending and limit
            const sortedRatings = Array.from(latestRatings.values())
                .sort((a, b) => b.rating - a.rating)
                .slice(0, limit);

            if (sortedRatings.length === 0) {
                return [];
            }

            // Fetch student details
            const studentIds = sortedRatings.map(d => d.student_id);
            let studentsQuery = window.supabaseClient
                .from('students')
                .select('id, first_name, last_name, branch_id, branch:branches(name)')
                .in('id', studentIds);

            if (branchId) {
                studentsQuery = studentsQuery.eq('branch_id', branchId);
            }

            const { data: students } = await studentsQuery;
            const studentMap = new Map(students?.map(s => [s.id, s]) || []);

            return sortedRatings
                .filter(entry => studentMap.has(entry.student_id))
                .map((entry, index) => {
                    const student = studentMap.get(entry.student_id);
                    const { league, leagueTier } = this._calculateLeague(entry.rating);
                    return {
                        rank: index + 1,
                        studentId: entry.student_id,
                        firstName: student?.first_name || '',
                        lastName: student?.last_name || '',
                        branch: student?.branch?.name || '',
                        rating: entry.rating,
                        league: league,
                        leagueTier: leagueTier
                    };
                });
        } catch (e) {
            console.error('Error fetching rating leaderboard:', e);
            return [];
        }
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
            botProgressRaw,
            survivalScores,
            bestSurvivalRaw,
            rankings,
            achievements
        ] = await Promise.all([
            this.getStudentById(studentId),
            this.getCurrentRating(studentId),
            this.getStudentRatings(studentId),
            this.getStudentBotBattles(studentId),
            this.getStudentBotProgress(studentId),
            this.getStudentSurvivalScores(studentId),
            this.getBestSurvivalScore(studentId, 'puzzle_rush'),
            this.getStudentRankings(studentId),
            this.getStudentAchievements(studentId)
        ]);

        // Transform botProgress to expected format
        const botProgress = {
            count: botProgressRaw.botsDefeated || 0,
            total: window.TOTAL_BOTS || 17,
            defeated: (botProgressRaw.defeatedBots || []).map(name => ({ bot_name: name })),
            highestRating: botProgressRaw.highestBotRating || 0
        };

        // Transform bestSurvival to expected format
        const survival = {
            best: {
                score: bestSurvivalRaw.bestScore || 0,
                achievedAt: bestSurvivalRaw.achievedAt
            },
            scores: survivalScores.slice(0, 10) // Last 10 scores
        };

        return {
            ...basicInfo,
            rating: currentRating,
            ratings: { current: currentRating, history: ratingHistory.slice(0, 10) }, // Nested structure for compatibility
            ratingHistory: ratingHistory.slice(0, 10), // Last 10 ratings (kept for backward compatibility)
            botBattles,
            botProgress,
            survivalScores: survivalScores.slice(0, 10), // Last 10 scores (kept for compatibility)
            survival,
            rankings,
            achievements
        };
    },

    // ============================================
    // ATTENDANCE TRACKING
    // ============================================

    /**
     * Get attendance records with filters
     * @param {Object} filters - Filter options
     * @param {string} filters.branchId - Branch UUID (required)
     * @param {string} filters.scheduleType - 'mon_wed', 'tue_thu', or 'sat_sun'
     * @param {string} filters.timeSlot - Time slot string (e.g., '10:00-11:00')
     * @param {number} filters.year - Year (e.g., 2025)
     * @param {number} filters.month - Month (1-12)
     * @returns {Array} Attendance records with student info
     */
    async getAttendance(filters = {}) {
        const { branchId, scheduleType, timeSlot, year, month } = filters;

        if (!branchId) {
            console.error('Branch ID is required for attendance query');
            return [];
        }

        let query = window.supabaseClient
            .from('attendance')
            .select(`
                *,
                student:students(id, first_name, last_name)
            `)
            .eq('branch_id', branchId)
            .order('attendance_date', { ascending: true });

        if (scheduleType) {
            query = query.eq('schedule_type', scheduleType);
        }

        if (timeSlot) {
            query = query.eq('time_slot', timeSlot);
        }

        // Filter by year and month if provided
        if (year && month) {
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month
            query = query.gte('attendance_date', startDate).lte('attendance_date', endDate);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching attendance:', error);
            return [];
        }

        return data.map(record => ({
            id: record.id,
            studentId: record.student_id,
            studentFirstName: record.student?.first_name || '',
            studentLastName: record.student?.last_name || '',
            branchId: record.branch_id,
            attendanceDate: record.attendance_date,
            scheduleType: record.schedule_type,
            timeSlot: record.time_slot,
            status: record.status,
            notes: record.notes,
            createdAt: record.created_at,
            updatedAt: record.updated_at
        }));
    },

    /**
     * Get students with their attendance for a specific branch/schedule/month
     * Returns a structure optimized for calendar rendering
     */
    async getAttendanceCalendarData(branchId, scheduleType, year, month, coachId = null) {
        // Calculate date range
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        // Build attendance query
        let attendanceQuery = window.supabaseClient
            .from('attendance')
            .select('*')
            .eq('branch_id', branchId)
            .gte('attendance_date', startDate)
            .lte('attendance_date', endDate);

        if (scheduleType) {
            attendanceQuery = attendanceQuery.eq('schedule_type', scheduleType);
        }

        // Build students query
        let studentsQuery = window.supabaseClient
            .from('students')
            .select('id, first_name, last_name, coach_id')
            .eq('branch_id', branchId)
            .eq('status', 'active')
            .order('last_name');

        // Apply coach filter if provided
        if (coachId === 'unassigned') {
            studentsQuery = studentsQuery.is('coach_id', null);
        } else if (coachId && coachId !== 'all') {
            studentsQuery = studentsQuery.eq('coach_id', coachId);
        }

        // Run both queries in parallel for faster loading
        const [studentsResult, attendanceResult] = await Promise.all([
            studentsQuery,
            attendanceQuery
        ]);

        const { data: students, error: studentsError } = studentsResult;
        const { data: attendanceRecords, error: attendanceError } = attendanceResult;

        if (studentsError) {
            console.error('Error fetching students:', studentsError);
            return { students: [], attendance: {} };
        }

        // Build attendance map: { studentId: { 'YYYY-MM-DD': { status, timeSlot } } }
        const attendanceMap = {};
        if (!attendanceError && attendanceRecords) {
            attendanceRecords.forEach(record => {
                if (!attendanceMap[record.student_id]) {
                    attendanceMap[record.student_id] = {};
                }
                const key = record.time_slot
                    ? `${record.attendance_date}_${record.time_slot}`
                    : record.attendance_date;
                attendanceMap[record.student_id][key] = {
                    id: record.id,
                    status: record.status,
                    timeSlot: record.time_slot,
                    notes: record.notes
                };
            });
        } else if (attendanceError) {
            console.error('Error fetching attendance records:', attendanceError);
        }

        return {
            students: students.map(s => ({
                id: s.id,
                firstName: s.first_name,
                lastName: s.last_name
            })),
            attendance: attendanceMap
        };
    },

    /**
     * Upsert a single attendance record
     * Uses ON CONFLICT to update if exists, insert if new
     */
    async upsertAttendance(attendanceData) {
        const { studentId, branchId, attendanceDate, scheduleType, timeSlot, status, notes } = attendanceData;

        const { data, error } = await window.supabaseClient
            .from('attendance')
            .upsert([{
                student_id: studentId,
                branch_id: branchId,
                attendance_date: attendanceDate,
                schedule_type: scheduleType,
                time_slot: timeSlot || null,
                status: status,
                notes: notes || null,
                updated_at: new Date().toISOString()
            }], {
                onConflict: 'student_id,attendance_date,schedule_type,time_slot'
            })
            .select()
            .single();

        if (error) {
            console.error('Error upserting attendance:', error);
            throw error;
        }

        return {
            id: data.id,
            studentId: data.student_id,
            branchId: data.branch_id,
            attendanceDate: data.attendance_date,
            scheduleType: data.schedule_type,
            timeSlot: data.time_slot,
            status: data.status,
            notes: data.notes
        };
    },

    /**
     * Bulk upsert attendance records (for Excel import)
     * @param {Array} records - Array of attendance records
     * @returns {Object} { inserted: number, updated: number, errors: Array }
     */
    async bulkUpsertAttendance(records) {
        if (!records || records.length === 0) {
            return { inserted: 0, updated: 0, errors: [] };
        }

        const insertData = records.map(r => ({
            student_id: r.studentId,
            branch_id: r.branchId,
            attendance_date: r.attendanceDate,
            schedule_type: r.scheduleType,
            time_slot: r.timeSlot || null,
            status: r.status || 'present',
            notes: r.notes || null,
            updated_at: new Date().toISOString()
        }));

        const { data, error } = await window.supabaseClient
            .from('attendance')
            .upsert(insertData, {
                onConflict: 'student_id,attendance_date,schedule_type,time_slot'
            })
            .select();

        if (error) {
            console.error('Error bulk upserting attendance:', error);
            return { inserted: 0, updated: 0, errors: [error.message] };
        }

        return {
            inserted: data.length,
            updated: 0, // Supabase doesn't distinguish, but all were processed
            errors: []
        };
    },

    /**
     * Delete an attendance record
     */
    async deleteAttendance(attendanceId) {
        const { error } = await window.supabaseClient
            .from('attendance')
            .delete()
            .eq('id', attendanceId);

        if (error) {
            console.error('Error deleting attendance:', error);
            throw error;
        }

        return true;
    },

    // ============================================
    // STUDENT NAME ALIASES (for Excel import matching)
    // ============================================

    /**
     * Get all student name aliases
     * Used for matching Russian names from Excel to students
     */
    async getStudentNameAliases() {
        const { data, error } = await window.supabaseClient
            .from('student_name_aliases')
            .select(`
                *,
                student:students(id, first_name, last_name)
            `)
            .order('alias_name');

        if (error) {
            console.error('Error fetching name aliases:', error);
            return [];
        }

        return data.map(alias => ({
            id: alias.id,
            studentId: alias.student_id,
            aliasName: alias.alias_name,
            studentFirstName: alias.student?.first_name || '',
            studentLastName: alias.student?.last_name || '',
            createdAt: alias.created_at
        }));
    },

    /**
     * Add a new student name alias
     * Used to save successful name matches for future imports
     */
    async addStudentNameAlias(studentId, aliasName) {
        // Check if alias already exists
        const { data: existing } = await window.supabaseClient
            .from('student_name_aliases')
            .select('id')
            .eq('alias_name', aliasName)
            .single();

        if (existing) {
            // Update existing alias to point to new student
            const { data, error } = await window.supabaseClient
                .from('student_name_aliases')
                .update({ student_id: studentId })
                .eq('alias_name', aliasName)
                .select()
                .single();

            if (error) {
                console.error('Error updating name alias:', error);
                throw error;
            }

            return { id: data.id, studentId: data.student_id, aliasName: data.alias_name };
        }

        // Insert new alias
        const { data, error } = await window.supabaseClient
            .from('student_name_aliases')
            .insert([{
                student_id: studentId,
                alias_name: aliasName
            }])
            .select()
            .single();

        if (error) {
            console.error('Error adding name alias:', error);
            throw error;
        }

        return {
            id: data.id,
            studentId: data.student_id,
            aliasName: data.alias_name
        };
    },

    /**
     * Delete a student name alias
     */
    async deleteStudentNameAlias(aliasId) {
        const { error } = await window.supabaseClient
            .from('student_name_aliases')
            .delete()
            .eq('id', aliasId);

        if (error) {
            console.error('Error deleting name alias:', error);
            throw error;
        }

        return true;
    },

    /**
     * Find student by alias name (for Excel import)
     */
    async findStudentByAlias(aliasName) {
        const { data, error } = await window.supabaseClient
            .from('student_name_aliases')
            .select(`
                student_id,
                student:students(id, first_name, last_name, branch_id)
            `)
            .eq('alias_name', aliasName)
            .single();

        if (error || !data) {
            return null;
        }

        return {
            studentId: data.student_id,
            firstName: data.student?.first_name || '',
            lastName: data.student?.last_name || '',
            branchId: data.student?.branch_id
        };
    },

    // ============================================
    // ATTENDANCE STATISTICS
    // ============================================

    /**
     * Get attendance rates for students in a branch
     * Uses the student_attendance_rates view
     */
    async getStudentAttendanceRates(branchId, scheduleType = null) {
        try {
            let query = window.supabaseClient
                .from('student_attendance_rates')
                .select('*')
                .eq('branch_id', branchId);

            if (scheduleType) {
                query = query.eq('schedule_type', scheduleType);
            }

            const { data, error } = await query.order('attendance_rate', { ascending: true });

            if (error) {
                // View might not exist - return empty silently
                return [];
            }

            return data.map(r => ({
                studentId: r.student_id,
                firstName: r.first_name,
                lastName: r.last_name,
                branchId: r.branch_id,
                scheduleType: r.schedule_type,
                totalSessions: r.total_sessions,
                presentCount: r.present_count,
                attendanceRate: r.attendance_rate
            }));
        } catch (e) {
            // View might not exist - return empty silently
            return [];
        }
    },

    /**
     * Get branch attendance summary
     * @param {string} branchId - Branch UUID
     * @param {number} year - Year (e.g., 2025)
     * @param {number} month - Month (1-12)
     */
    async getBranchAttendanceSummary(branchId, year, month) {
        // Calculate start and end dates from year and month
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month

        const { data, error } = await window.supabaseClient
            .rpc('get_branch_attendance_summary', {
                p_branch_id: branchId,
                p_start_date: startDate,
                p_end_date: endDate
            });

        if (error) {
            console.error('Error fetching branch attendance summary:', error);
            return null;
        }

        // The function returns a single row, not an array
        if (data && data.length > 0) {
            const r = data[0];
            return {
                totalStudents: r.total_students || 0,
                totalSessions: r.total_sessions || 0,
                avgAttendanceRate: r.avg_attendance_rate || 0,
                studentsBelow70: r.students_below_70 || 0
            };
        }

        return {
            totalStudents: 0,
            totalSessions: 0,
            avgAttendanceRate: 0,
            studentsBelow70: 0
        };
    },

    /**
     * Get low attendance alerts (students below threshold)
     * @param {string} branchId - Branch UUID
     * @param {number} threshold - Attendance rate threshold (default 70%)
     */
    async getLowAttendanceAlerts(branchId, threshold = 70) {
        const rates = await this.getStudentAttendanceRates(branchId);

        return rates
            .filter(r => r.totalSessions >= 3 && r.attendanceRate < threshold)
            .sort((a, b) => a.attendanceRate - b.attendanceRate);
    },

    /**
     * Get distinct time slots used for a branch/schedule
     */
    async getAttendanceTimeSlots(branchId, scheduleType) {
        const { data, error } = await window.supabaseClient
            .from('attendance')
            .select('time_slot')
            .eq('branch_id', branchId)
            .eq('schedule_type', scheduleType)
            .not('time_slot', 'is', null);

        if (error) {
            console.error('Error fetching time slots:', error);
            return [];
        }

        // Get unique time slots
        const uniqueSlots = [...new Set(data.map(d => d.time_slot))].filter(Boolean);
        return uniqueSlots.sort();
    },

    // ============================================
    // STUDENT TIME SLOT ASSIGNMENTS
    // ============================================

    /**
     * Get time slot assignments for students in a branch/schedule
     * @param {string} branchId - Branch UUID
     * @param {string} scheduleType - 'mon_wed', 'tue_thu', or 'sat_sun'
     * @returns {Array} Array of { studentId, timeSlotIndex }
     */
    async getTimeSlotAssignments(branchId, scheduleType) {
        try {
            const { data, error } = await window.supabaseClient
                .from('student_time_slot_assignments')
                .select('student_id, time_slot_index')
                .eq('branch_id', branchId)
                .eq('schedule_type', scheduleType);

            if (error) {
                // Table might not exist yet - return empty silently
                console.log('Time slot assignments table not available:', error.message);
                return [];
            }

            return data.map(d => ({
                studentId: d.student_id,
                timeSlotIndex: d.time_slot_index
            }));
        } catch (e) {
            // Table might not exist - return empty silently
            return [];
        }
    },

    /**
     * Update or create a time slot assignment for a student
     * @param {string} studentId - Student UUID
     * @param {string} branchId - Branch UUID
     * @param {string} scheduleType - 'mon_wed', 'tue_thu', or 'sat_sun'
     * @param {number} timeSlotIndex - The time slot index (0-based)
     * @returns {Object} The upserted assignment
     */
    async upsertTimeSlotAssignment(studentId, branchId, scheduleType, timeSlotIndex) {
        const { data, error } = await window.supabaseClient
            .from('student_time_slot_assignments')
            .upsert([{
                student_id: studentId,
                branch_id: branchId,
                schedule_type: scheduleType,
                time_slot_index: timeSlotIndex,
                updated_at: new Date().toISOString()
            }], {
                onConflict: 'student_id,branch_id,schedule_type'
            })
            .select()
            .single();

        if (error) {
            console.error('Error upserting time slot assignment:', error);
            throw error;
        }

        return {
            id: data.id,
            studentId: data.student_id,
            branchId: data.branch_id,
            scheduleType: data.schedule_type,
            timeSlotIndex: data.time_slot_index
        };
    },

    /**
     * Bulk upsert time slot assignments (for initializing or importing)
     * @param {Array} assignments - Array of { studentId, branchId, scheduleType, timeSlotIndex }
     * @returns {Object} { success: number, errors: Array }
     */
    async bulkUpsertTimeSlotAssignments(assignments) {
        if (!assignments || assignments.length === 0) {
            return { success: 0, errors: [] };
        }

        const insertData = assignments.map(a => ({
            student_id: a.studentId,
            branch_id: a.branchId,
            schedule_type: a.scheduleType,
            time_slot_index: a.timeSlotIndex,
            updated_at: new Date().toISOString()
        }));

        const { data, error } = await window.supabaseClient
            .from('student_time_slot_assignments')
            .upsert(insertData, {
                onConflict: 'student_id,branch_id,schedule_type'
            })
            .select();

        if (error) {
            console.error('Error bulk upserting time slot assignments:', error);
            return { success: 0, errors: [error.message] };
        }

        return {
            success: data.length,
            errors: []
        };
    },

    /**
     * Delete a time slot assignment
     * @param {string} studentId - Student UUID
     * @param {string} branchId - Branch UUID
     * @param {string} scheduleType - 'mon_wed', 'tue_thu', or 'sat_sun'
     */
    async deleteTimeSlotAssignment(studentId, branchId, scheduleType) {
        const { error } = await window.supabaseClient
            .from('student_time_slot_assignments')
            .delete()
            .eq('student_id', studentId)
            .eq('branch_id', branchId)
            .eq('schedule_type', scheduleType);

        if (error) {
            console.error('Error deleting time slot assignment:', error);
            throw error;
        }

        return true;
    }
};

// Make it available globally
window.supabaseData = supabaseData;
