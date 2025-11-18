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
    }
};

// Make it available globally
window.supabaseData = supabaseData;
