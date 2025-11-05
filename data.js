// ==========================================
// CHESS EMPIRE DATABASE - GLOBAL DATA VARIABLES
// ==========================================
// IMPORTANT: This file only declares EMPTY global variables.
// All data is loaded from Supabase database via crud.js
// DO NOT add hardcoded data here - it will prevent Supabase sync!
// ==========================================

// Students array - populated from Supabase
let students = [];

// Coaches array - populated from Supabase
// MUST remain empty - all coach data comes from Supabase
let coaches = [];

// Branches array - populated from Supabase (minimal fallback data for UI to function)
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
