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
                coach_branches(
                    branch_id,
                    branch:branches(id, name, location)
                )
            `)
            .order('last_name');

        if (error) {
            console.error('Error fetching coaches:', error);
            return [];
        }

        // Group by coach and aggregate branches
        const coachesMap = new Map();

        data.forEach(row => {
            const coachId = row.id;

            if (!coachesMap.has(coachId)) {
                coachesMap.set(coachId, {
                    id: row.id,
                    firstName: row.first_name,
                    lastName: row.last_name,
                    fullName: `${row.first_name} ${row.last_name}`,
                    phone: row.phone,
                    email: row.email,
                    photoUrl: row.photo_url,
                    bio: row.bio,
                    instagramUrl: row.instagram_url,
                    whatsappUrl: row.whatsapp_url,
                    branches: [], // NEW: Array of branch objects
                    branchIds: [], // NEW: Array of branch IDs
                    branchNames: [], // NEW: Array of branch names
                    // Backwards compatibility
                    branch: '',
                    branchName: '',
                    branchId: null
                });
            }

            const coach = coachesMap.get(coachId);

            // Add branches from junction table
            if (row.coach_branches && row.coach_branches.length > 0) {
                row.coach_branches.forEach(cb => {
                    if (cb.branch) {
                        coach.branches.push({
                            id: cb.branch.id,
                            name: cb.branch.name,
                            location: cb.branch.location
                        });
                        coach.branchIds.push(cb.branch.id);
                        coach.branchNames.push(cb.branch.name);
                    }
                });
            }
        });

        // Convert map to array and set first branch for backwards compat
        return Array.from(coachesMap.values()).map(coach => {
            if (coach.branches.length > 0) {
                coach.branch = coach.branches[0].name;
                coach.branchName = coach.branches[0].name;
                coach.branchId = coach.branches[0].id;
            }
            return coach;
        });
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
     * COACH-BRANCH ASSIGNMENTS (Many-to-Many)
     */

    // Get coaches assigned to a specific branch
    async getCoachesByBranchId(branchId) {
        const { data, error } = await window.supabaseClient
            .from('coach_branches')
            .select(`
                coach:coaches(
                    id,
                    first_name,
                    last_name,
                    phone,
                    email,
                    photo_url,
                    bio,
                    instagram_url,
                    whatsapp_url
                )
            `)
            .eq('branch_id', branchId)
            .order('coach.last_name');

        if (error) {
            console.error('Error fetching coaches for branch:', error);
            return [];
        }

        return data.map(row => ({
            id: row.coach.id,
            firstName: row.coach.first_name,
            lastName: row.coach.last_name,
            fullName: `${row.coach.first_name} ${row.coach.last_name}`,
            phone: row.coach.phone,
            email: row.coach.email,
            photoUrl: row.coach.photo_url,
            bio: row.coach.bio,
            instagramUrl: row.coach.instagram_url,
            whatsappUrl: row.coach.whatsapp_url
        }));
    },

    // Add coach to branch
    async addCoachToBranch(coachId, branchId) {
        const { data, error } = await window.supabaseClient
            .from('coach_branches')
            .insert([{ coach_id: coachId, branch_id: branchId }])
            .select()
            .single();

        if (error) {
            console.error('Error adding coach to branch:', error);
            throw error;
        }

        return data;
    },

    // Remove coach from branch
    async removeCoachFromBranch(coachId, branchId) {
        const { error } = await window.supabaseClient
            .from('coach_branches')
            .delete()
            .eq('coach_id', coachId)
            .eq('branch_id', branchId);

        if (error) {
            console.error('Error removing coach from branch:', error);
            throw error;
        }

        return true;
    },

    // Get all branches for a coach
    async getCoachBranches(coachId) {
        const { data, error } = await window.supabaseClient
            .from('coach_branches')
            .select(`
                branch:branches(id, name, location, phone, email)
            `)
            .eq('coach_id', coachId);

        if (error) {
            console.error('Error fetching coach branches:', error);
            return [];
        }

        return data.map(row => row.branch);
    },

    // Update all branch assignments for a coach (replaces existing)
    async updateCoachBranches(coachId, branchIds) {
        // Delete existing assignments
        await window.supabaseClient
            .from('coach_branches')
            .delete()
            .eq('coach_id', coachId);

        // Insert new assignments
        if (branchIds && branchIds.length > 0) {
            const assignments = branchIds.map(branchId => ({
                coach_id: coachId,
                branch_id: branchId
            }));

            const { error } = await window.supabaseClient
                .from('coach_branches')
                .insert(assignments);

            if (error) {
                console.error('Error updating coach branches:', error);
                throw error;
            }
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
    // Thresholds: 800+ A, 451-800 B, 0-450 C
    _calculateLeague(rating) {
        if (rating > 800) return { league: 'League A', leagueTier: 'gold' };
        if (rating > 450) return { league: 'League B', leagueTier: 'silver' };
        return { league: 'League C', leagueTier: 'bronze' };
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

    // Get rating change history with deltas for a student
    async getStudentRatingChanges(studentId) {
        const { data, error } = await window.supabaseClient
            .from('student_rating_changes')
            .select('*')
            .eq('student_id', studentId)
            .order('change_date', { ascending: false });

        if (error) {
            console.error('Error fetching student rating changes:', error);
            return [];
        }

        return data.map(r => ({
            id: r.id,
            studentId: r.student_id,
            currentRating: r.current_rating,
            previousRating: r.previous_rating,
            ratingChange: r.rating_change,
            changeType: r.change_type,
            changeDate: r.change_date,
            previousDate: r.previous_rating_date,
            source: r.source,
            notes: r.notes,
            createdAt: r.created_at
        }));
    },

    // Get rating trend summary for a student (30-day default)
    async getRatingTrendSummary(studentId, days = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

        const { data, error } = await window.supabaseClient
            .from('student_rating_changes')
            .select('*')
            .eq('student_id', studentId)
            .gte('change_date', cutoffDateStr)
            .order('change_date', { ascending: true });

        if (error || !data || data.length === 0) {
            return {
                totalChanges: 0,
                netChange: 0,
                averageChange: 0,
                biggestGain: 0,
                biggestLoss: 0,
                increases: 0,
                decreases: 0,
                period: days
            };
        }

        const changes = data.filter(r => r.rating_change !== 0);
        const increases = changes.filter(r => r.rating_change > 0);
        const decreases = changes.filter(r => r.rating_change < 0);

        const netChange = data[data.length - 1].current_rating - (data[0].previous_rating || data[0].current_rating);
        const averageChange = changes.length > 0
            ? changes.reduce((sum, r) => sum + Math.abs(r.rating_change), 0) / changes.length
            : 0;

        return {
            totalChanges: changes.length,
            netChange,
            averageChange: Math.round(averageChange),
            biggestGain: increases.length > 0 ? Math.max(...increases.map(r => r.rating_change)) : 0,
            biggestLoss: decreases.length > 0 ? Math.min(...decreases.map(r => r.rating_change)) : 0,
            increases: increases.length,
            decreases: decreases.length,
            period: days
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
        // Calculate last day of month without timezone conversion
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

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
        const { data, error } = await window.supabaseClient
            .from('attendance')
            .delete()
            .eq('id', attendanceId)
            .select();  // Request deleted rows to verify deletion

        if (error) {
            console.error('Error deleting attendance:', error);
            throw error;
        }

        // Check if any rows were actually deleted
        if (!data || data.length === 0) {
            const message = 'Failed to delete attendance record (not found or insufficient permissions)';
            console.warn(message, { attendanceId });
            throw new Error(message);
        }

        console.log('Successfully deleted attendance record:', attendanceId);
        return true;
    },

    // Delete attendance by composite key (fallback when ID is not available)
    async deleteAttendanceByKey(studentId, attendanceDate, scheduleType, timeSlot) {
        let query = window.supabaseClient
            .from('attendance')
            .delete()
            .eq('student_id', studentId)
            .eq('attendance_date', attendanceDate)
            .eq('schedule_type', scheduleType);

        // Handle time_slot: can be null or a specific value
        if (timeSlot) {
            query = query.eq('time_slot', timeSlot);
        } else {
            query = query.is('time_slot', null);
        }

        // Add .select() to verify deletion
        query = query.select();

        const { data, error } = await query;

        if (error) {
            console.error('Error deleting attendance by key:', error);
            throw error;
        }

        // Check if any rows were actually deleted
        if (!data || data.length === 0) {
            const message = 'Failed to delete attendance record (not found or insufficient permissions)';
            console.warn(message, { studentId, attendanceDate, scheduleType, timeSlot });
            throw new Error(message);
        }

        console.log('Successfully deleted attendance record by key');
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
    },

    /**
     * ===================================
     * AUDIT LOG METHODS
     * ===================================
     */

    /**
     * Get audit log entries with filtering and pagination
     * @param {Object} filters - Filter options
     * @param {string} filters.entityType - Filter by entity type ('students', 'coaches', 'branches')
     * @param {string} filters.entityId - Filter by specific entity UUID
     * @param {string} filters.action - Filter by action type ('CREATE', 'UPDATE', 'DELETE')
     * @param {string} filters.fieldName - Filter by specific field name
     * @param {string} filters.changedByEmail - Filter by user email
     * @param {string} filters.fromDate - Filter from date (ISO string)
     * @param {string} filters.toDate - Filter to date (ISO string)
     * @param {number} filters.limit - Number of results (default 50, max 500)
     * @param {number} filters.offset - Pagination offset (default 0)
     * @returns {Promise<Array>} Array of audit log entries
     */
    async getAuditLog(filters = {}) {
        try {
            let query = window.supabaseClient
                .from('audit_log')
                .select('*', { count: 'exact' });

            // Apply filters
            if (filters.entityType) {
                query = query.eq('entity_type', filters.entityType);
            }
            if (filters.entityId) {
                query = query.eq('entity_id', filters.entityId);
            }
            if (filters.action) {
                query = query.eq('action', filters.action);
            }
            if (filters.fieldName) {
                query = query.eq('field_name', filters.fieldName);
            }
            if (filters.changedByEmail) {
                query = query.ilike('changed_by_email', `%${filters.changedByEmail}%`);
            }
            if (filters.fromDate) {
                query = query.gte('changed_at', filters.fromDate);
            }
            if (filters.toDate) {
                query = query.lte('changed_at', filters.toDate);
            }

            // Apply pagination
            const limit = Math.min(filters.limit || 50, 500);
            const offset = filters.offset || 0;
            query = query.order('changed_at', { ascending: false })
                        .range(offset, offset + limit - 1);

            const { data, error, count } = await query;

            if (error) {
                console.error('Error fetching audit log:', error);
                return { entries: [], total: 0 };
            }

            // Transform to camelCase
            const entries = (data || []).map(entry => ({
                id: entry.id,
                entityType: entry.entity_type,
                entityId: entry.entity_id,
                action: entry.action,
                fieldName: entry.field_name,
                oldValue: entry.old_value,
                newValue: entry.new_value,
                changedBy: entry.changed_by,
                changedByEmail: entry.changed_by_email,
                changedAt: entry.changed_at,
                ipAddress: entry.ip_address,
                userAgent: entry.user_agent
            }));

            return {
                entries,
                total: count || 0,
                limit,
                offset
            };
        } catch (error) {
            console.error('Error in getAuditLog:', error);
            return { entries: [], total: 0 };
        }
    },

    /**
     * Get complete audit history for a specific entity
     * @param {string} entityType - Entity type ('students', 'coaches', 'branches')
     * @param {string} entityId - Entity UUID
     * @returns {Promise<Array>} Array of audit log entries for this entity
     */
    async getEntityAuditLog(entityType, entityId) {
        try {
            const { data, error } = await window.supabaseClient
                .rpc('get_entity_audit_history', {
                    p_entity_type: entityType,
                    p_entity_id: entityId
                });

            if (error) {
                console.error('Error fetching entity audit history:', error);
                return [];
            }

            // Transform to camelCase
            return (data || []).map(entry => ({
                id: entry.id,
                action: entry.action,
                fieldName: entry.field_name,
                oldValue: entry.old_value,
                newValue: entry.new_value,
                changedByEmail: entry.changed_by_email,
                changedAt: entry.changed_at
            }));
        } catch (error) {
            console.error('Error in getEntityAuditLog:', error);
            return [];
        }
    },

    /**
     * Get recent audit activity (last 24 hours by default)
     * @param {number} limit - Maximum number of entries (default 50)
     * @returns {Promise<Array>} Array of recent audit log entries
     */
    async getRecentAuditActivity(limit = 50) {
        try {
            const { data, error } = await window.supabaseClient
                .rpc('get_recent_audit_activity', {
                    p_limit: limit
                });

            if (error) {
                console.error('Error fetching recent audit activity:', error);
                return [];
            }

            // Transform to camelCase
            return (data || []).map(entry => ({
                id: entry.id,
                entityType: entry.entity_type,
                entityId: entry.entity_id,
                action: entry.action,
                fieldName: entry.field_name,
                oldValue: entry.old_value,
                newValue: entry.new_value,
                changedByEmail: entry.changed_by_email,
                changedAt: entry.changed_at
            }));
        } catch (error) {
            console.error('Error in getRecentAuditActivity:', error);
            return [];
        }
    },

    /**
     * Export audit log to CSV format
     * @param {Object} filters - Same filters as getAuditLog
     * @returns {Promise<string>} CSV string
     */
    async exportAuditLogCSV(filters = {}) {
        try {
            // Get all matching entries (up to 5000 for export)
            const result = await this.getAuditLog({
                ...filters,
                limit: 5000,
                offset: 0
            });

            const entries = result.entries || [];

            // CSV header
            let csv = 'Timestamp,Entity Type,Entity ID,Action,Field,Old Value,New Value,Changed By\n';

            // CSV rows
            entries.forEach(entry => {
                const row = [
                    entry.changedAt,
                    entry.entityType,
                    entry.entityId,
                    entry.action,
                    entry.fieldName || '',
                    entry.oldValue || '',
                    entry.newValue || '',
                    entry.changedByEmail
                ].map(val => {
                    // Escape quotes and wrap in quotes if contains comma/newline
                    const str = String(val || '');
                    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                        return '"' + str.replace(/"/g, '""') + '"';
                    }
                    return str;
                }).join(',');

                csv += row + '\n';
            });

            return csv;
        } catch (error) {
            console.error('Error exporting audit log to CSV:', error);
            return '';
        }
    },

    /**
     * ===================================
     * STATUS HISTORY METHODS
     * ===================================
     */

    /**
     * Get status history for a specific student
     * @param {string} studentId - Student UUID
     * @returns {Promise<Array>} Array of status changes
     */
    async getStudentStatusHistory(studentId) {
        try {
            const { data, error } = await window.supabaseClient
                .rpc('get_student_status_history', {
                    p_student_id: studentId
                });

            if (error) {
                console.error('Error fetching student status history:', error);
                return [];
            }

            return (data || []).map(entry => ({
                id: entry.id,
                oldStatus: entry.old_status,
                newStatus: entry.new_status,
                changedAt: entry.changed_at,
                changedByEmail: entry.changed_by_email,
                reason: entry.reason,
                notes: entry.notes
            }));
        } catch (error) {
            console.error('Error in getStudentStatusHistory:', error);
            return [];
        }
    },

    /**
     * Get all status history with filtering
     * @param {Object} filters - Filter options
     * @param {string} filters.studentId - Filter by student UUID
     * @param {string} filters.oldStatus - Filter by old status
     * @param {string} filters.newStatus - Filter by new status
     * @param {string} filters.fromDate - Filter from date (ISO string)
     * @param {string} filters.toDate - Filter to date (ISO string)
     * @param {number} filters.limit - Number of results (default 100)
     * @returns {Promise<Array>} Array of status change entries
     */
    async getStatusHistory(filters = {}) {
        try {
            let query = window.supabaseClient
                .from('student_status_history')
                .select(`
                    *,
                    student:students(id, first_name, last_name, branch:branches(name))
                `);

            // Apply filters
            if (filters.studentId) {
                query = query.eq('student_id', filters.studentId);
            }
            if (filters.oldStatus) {
                query = query.eq('old_status', filters.oldStatus);
            }
            if (filters.newStatus) {
                query = query.eq('new_status', filters.newStatus);
            }
            if (filters.fromDate) {
                query = query.gte('changed_at', filters.fromDate);
            }
            if (filters.toDate) {
                query = query.lte('changed_at', filters.toDate);
            }

            const limit = filters.limit || 100;
            query = query.order('changed_at', { ascending: false }).limit(limit);

            const { data, error } = await query;

            if (error) {
                console.error('Error fetching status history:', error);
                return [];
            }

            return (data || []).map(entry => ({
                id: entry.id,
                studentId: entry.student_id,
                studentName: entry.student ? `${entry.student.first_name} ${entry.student.last_name}` : '',
                studentBranch: entry.student?.branch?.name || '',
                oldStatus: entry.old_status,
                newStatus: entry.new_status,
                changedAt: entry.changed_at,
                changedByEmail: entry.changed_by_email,
                reason: entry.reason,
                notes: entry.notes
            }));
        } catch (error) {
            console.error('Error in getStatusHistory:', error);
            return [];
        }
    },

    /**
     * Get freeze periods for a student
     * @param {string} studentId - Student UUID
     * @returns {Promise<Array>} Array of freeze periods
     */
    async getStudentFreezePeriods(studentId) {
        try {
            const { data, error } = await window.supabaseClient
                .rpc('get_student_freeze_periods', {
                    p_student_id: studentId
                });

            if (error) {
                console.error('Error fetching freeze periods:', error);
                return [];
            }

            return (data || []).map(period => ({
                freezeStart: period.freeze_start,
                freezeEnd: period.freeze_end,
                durationDays: period.duration_days,
                isCurrentlyFrozen: period.is_currently_frozen
            }));
        } catch (error) {
            console.error('Error in getStudentFreezePeriods:', error);
            return [];
        }
    },

    /**
     * Get status transition statistics
     * @param {string} fromDate - Start date (ISO string, default 30 days ago)
     * @returns {Promise<Array>} Array of transition statistics
     */
    async getStatusTransitionStats(fromDate = null) {
        try {
            const params = {};
            if (fromDate) {
                params.p_from_date = fromDate;
            }

            const { data, error } = await window.supabaseClient
                .rpc('get_status_transition_stats', params);

            if (error) {
                console.error('Error fetching status transition stats:', error);
                return [];
            }

            return (data || []).map(stat => ({
                oldStatus: stat.old_status,
                newStatus: stat.new_status,
                transitionCount: stat.transition_count,
                avgDaysInOldStatus: stat.avg_days_in_old_status
            }));
        } catch (error) {
            console.error('Error in getStatusTransitionStats:', error);
            return [];
        }
    },

    /**
     * ===================================
     * USER SESSION METHODS
     * ===================================
     */

    /**
     * Log user login
     * @param {string} sessionToken - Optional session token from Supabase auth
     * @param {string} ipAddress - IP address (optional, requires Edge Function)
     * @param {string} userAgent - Browser user agent string
     * @returns {Promise<string>} Session UUID
     */
    async logLogin(sessionToken = null, ipAddress = null, userAgent = null) {
        try {
            // Get user agent from browser if not provided
            const ua = userAgent || navigator.userAgent;

            const { data, error } = await window.supabaseClient
                .rpc('log_user_login', {
                    p_session_token: sessionToken,
                    p_ip_address: ipAddress,
                    p_user_agent: ua
                });

            if (error) {
                console.error('Error logging user login:', error);
                return null;
            }

            return data; // Returns session UUID
        } catch (error) {
            console.error('Error in logLogin:', error);
            return null;
        }
    },

    /**
     * Log user logout
     * @param {string} sessionId - Optional specific session UUID to logout
     * @returns {Promise<boolean>} Success status
     */
    async logLogout(sessionId = null) {
        try {
            const { error } = await window.supabaseClient
                .rpc('log_user_logout', {
                    p_session_id: sessionId
                });

            if (error) {
                console.error('Error logging user logout:', error);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error in logLogout:', error);
            return false;
        }
    },

    /**
     * Get user sessions with filtering
     * @param {Object} filters - Filter options
     * @param {string} filters.userId - Filter by user UUID
     * @param {string} filters.status - Filter by status ('active', 'expired', 'logged_out')
     * @param {string} filters.deviceType - Filter by device type
     * @param {string} filters.fromDate - Filter from date (ISO string)
     * @param {string} filters.toDate - Filter to date (ISO string)
     * @param {number} filters.limit - Number of results (default 50)
     * @returns {Promise<Array>} Array of session entries
     */
    async getUserSessions(filters = {}) {
        try {
            let query = window.supabaseClient
                .from('user_sessions')
                .select('*');

            // Apply filters
            if (filters.userId) {
                query = query.eq('user_id', filters.userId);
            }
            if (filters.status) {
                query = query.eq('status', filters.status);
            }
            if (filters.deviceType) {
                query = query.eq('device_type', filters.deviceType);
            }
            if (filters.userEmail) {
                query = query.eq('user_email', filters.userEmail);
            }
            if (filters.fromDate) {
                query = query.gte('login_at', filters.fromDate);
            }
            if (filters.toDate) {
                query = query.lte('login_at', filters.toDate);
            }

            const limit = filters.limit || 50;
            query = query.order('login_at', { ascending: false }).limit(limit);

            const { data, error } = await query;

            if (error) {
                console.error('Error fetching user sessions:', error);
                return [];
            }

            return (data || []).map(session => ({
                id: session.id,
                userId: session.user_id,
                userEmail: session.user_email,
                sessionToken: session.session_token,
                loginAt: session.login_at,
                logoutAt: session.logout_at,
                ipAddress: session.ip_address,
                userAgent: session.user_agent,
                deviceType: session.device_type,
                browser: session.browser,
                browserVersion: session.browser_version,
                os: session.os,
                osVersion: session.os_version,
                status: session.status,
                sessionDurationMinutes: session.session_duration_minutes
            }));
        } catch (error) {
            console.error('Error in getUserSessions:', error);
            return [];
        }
    },

    /**
     * Get current user's active sessions
     * @returns {Promise<Array>} Array of active session entries
     */
    async getMyActiveSessions() {
        try {
            const { data, error } = await window.supabaseClient
                .rpc('get_user_active_sessions');

            if (error) {
                console.error('Error fetching active sessions:', error);
                return [];
            }

            return (data || []).map(session => ({
                id: session.id,
                loginAt: session.login_at,
                deviceType: session.device_type,
                browser: session.browser,
                os: session.os,
                ipAddress: session.ip_address
            }));
        } catch (error) {
            console.error('Error in getMyActiveSessions:', error);
            return [];
        }
    },

    /**
     * Get session statistics
     * @param {string} fromDate - Start date (ISO string)
     * @param {string} toDate - End date (ISO string)
     * @returns {Promise<Object>} Session statistics
     */
    async getSessionStats(fromDate = null, toDate = null) {
        try {
            const params = {};
            if (fromDate) params.p_from_date = fromDate;
            if (toDate) params.p_to_date = toDate;

            const { data, error } = await window.supabaseClient
                .rpc('get_session_stats', params);

            if (error) {
                console.error('Error fetching session stats:', error);
                return null;
            }

            if (!data || data.length === 0) return null;

            const stats = data[0];
            return {
                totalSessions: stats.total_sessions,
                uniqueUsers: stats.unique_users,
                avgSessionDurationMinutes: stats.avg_session_duration_minutes,
                desktopSessions: stats.desktop_sessions,
                mobileSessions: stats.mobile_sessions,
                tabletSessions: stats.tablet_sessions,
                topBrowser: stats.top_browser,
                topOs: stats.top_os
            };
        } catch (error) {
            console.error('Error in getSessionStats:', error);
            return null;
        }
    },

    // ============================================
    // USER ACTIVITY ANALYTICS METHODS
    // ============================================

    /**
     * Get admin and coach users for dropdown
     */
    async getAdminAndCoachUsers() {
        try {
            const { data, error } = await window.supabaseClient
                .rpc('get_admin_and_coach_users');

            if (error) {
                console.error('Error fetching admin and coach users:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error in getAdminAndCoachUsers:', error);
            return [];
        }
    },

    /**
     * Get user activity statistics for a date range
     */
    async getUserActivityStats(userEmail, fromDate, toDate) {
        try {
            const { data, error } = await window.supabaseClient
                .rpc('get_user_activity_stats', {
                    p_user_email: userEmail,
                    p_from_date: fromDate,
                    p_to_date: toDate
                });

            if (error) {
                console.error('Error fetching user activity stats:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error in getUserActivityStats:', error);
            return [];
        }
    },

    /**
     * Get all actions for a specific session
     */
    async getUserSessionWithActions(sessionId) {
        try {
            const { data, error } = await window.supabaseClient
                .rpc('get_user_session_with_actions', {
                    p_session_id: sessionId
                });

            if (error) {
                console.error('Error fetching session actions:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error in getUserSessionWithActions:', error);
            return [];
        }
    },

    /**
     * Get user summary statistics
     */
    async getUserSummary(userEmail) {
        try {
            const { data, error } = await window.supabaseClient
                .rpc('get_user_summary', {
                    p_user_email: userEmail
                });

            if (error) {
                console.error('Error fetching user summary:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error in getUserSummary:', error);
            return [];
        }
    },

    /**
     * Get user sessions with action counts (enhanced version of existing sessions query)
     */
    async getUserSessions(userEmail, limit = 10) {
        try {
            // First get the sessions
            const { data: sessions, error: sessionsError } = await window.supabaseClient
                .from('user_sessions')
                .select('*')
                .eq('user_email', userEmail)
                .order('login_at', { ascending: false })
                .limit(limit);

            if (sessionsError) {
                console.error('Error fetching user sessions:', sessionsError);
                return [];
            }

            // For each session, get the action count
            const sessionsWithActions = await Promise.all(
                sessions.map(async (session) => {
                    const { data: actionCount } = await window.supabaseClient
                        .from('audit_log')
                        .select('id', { count: 'exact', head: true })
                        .eq('session_id', session.id);

                    return {
                        ...session,
                        actions_count: actionCount || 0
                    };
                })
            );

            return sessionsWithActions;
        } catch (error) {
            console.error('Error in getUserSessions:', error);
            return [];
        }
    }
};

// Make it available globally
window.supabaseData = supabaseData;
