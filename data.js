// Sample student data for Chess Empire - Database cleared
// NOTE: These are now declared with 'let' so they can be overwritten by Supabase data
// If Supabase is unavailable, these will serve as fallback defaults
let students = [
    // Empty array - ready for real student data
];

// Coach data - 9 coaches across 7 branches
// Will be overwritten by Supabase data when available
let coaches = [
    {
        id: 1,
        firstName: "Asylkhan",
        lastName: "Akbaevich",
        branch: "Debut",
        email: "asylkhan@chessempire.kz",
        phone: "+7 (777) 111-11-11"
    },
    {
        id: 2,
        firstName: "Tanibergen",
        lastName: "Aibekovich",
        branch: "Almaty Arena",
        email: "tanibergen@chessempire.kz",
        phone: "+7 (777) 222-22-22"
    },
    {
        id: 3,
        firstName: "Alinur",
        lastName: "Serikovich",
        branch: "Halyk Arena",
        email: "alinur@chessempire.kz",
        phone: "+7 (777) 333-33-33"
    },
    {
        id: 4,
        firstName: "Zakir",
        lastName: "Anvarovich",
        branch: "Zhandosova",
        email: "zakir@chessempire.kz",
        phone: "+7 (777) 444-44-44"
    },
    {
        id: 5,
        firstName: "Arman",
        lastName: "Ermekovich",
        branch: "Zhandosova",
        email: "arman@chessempire.kz",
        phone: "+7 (777) 555-55-55"
    },
    {
        id: 6,
        firstName: "Khantuev",
        lastName: "Alexander",
        branch: "Halyk Arena",
        email: "alexander@chessempire.kz",
        phone: "+7 (777) 666-66-66"
    },
    {
        id: 7,
        firstName: "Nurgalimov",
        lastName: "Chingis",
        branch: "Gagarin Park",
        email: "chingis@chessempire.kz",
        phone: "+7 (777) 777-77-77"
    },
    {
        id: 8,
        firstName: "Karmenov",
        lastName: "Berik",
        branch: "Almaty 1",
        email: "berik@chessempire.kz",
        phone: "+7 (777) 888-88-88"
    },
    {
        id: 9,
        firstName: "Vasiliev",
        lastName: "Vasiliy",
        branch: "Abaya Rozybakieva",
        email: "vasiliy@chessempire.kz",
        phone: "+7 (777) 999-99-99"
    }
];

// Branch data - All 7 branches
// Will be overwritten by Supabase data when available
let branches = [
    {
        id: 1,
        name: "Gagarin Park",
        location: "Almaty, Gagarin Park",
        phone: "+7 (727) 250-12-34",
        email: "gagarinpark@chessempire.kz"
    },
    {
        id: 2,
        name: "Debut",
        location: "Almaty, Auezov District",
        phone: "+7 (727) 251-23-45",
        email: "debut@chessempire.kz"
    },
    {
        id: 3,
        name: "Almaty Arena",
        location: "Almaty, Bostandyk District",
        phone: "+7 (727) 252-34-56",
        email: "arena@chessempire.kz"
    },
    {
        id: 4,
        name: "Halyk Arena",
        location: "Almaty, Almaly District",
        phone: "+7 (727) 253-45-67",
        email: "halyk@chessempire.kz"
    },
    {
        id: 5,
        name: "Zhandosova",
        location: "Almaty, Zhandosov Street",
        phone: "+7 (727) 254-56-78",
        email: "zhandosova@chessempire.kz"
    },
    {
        id: 6,
        name: "Abaya Rozybakieva",
        location: "Almaty, Abay Avenue",
        phone: "+7 (727) 255-67-89",
        email: "abaya@chessempire.kz"
    },
    {
        id: 7,
        name: "Almaty 1",
        location: "Almaty, Railway Station Area",
        phone: "+7 (727) 256-78-90",
        email: "almaty1@chessempire.kz"
    }
];
