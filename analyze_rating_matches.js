const fs = require('fs');

// Levenshtein distance function for fuzzy matching
function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j - 1] + 1,
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1
                );
            }
        }
    }

    return dp[m][n];
}

// Student database from Supabase
const students = [{"first_name":"Abay","last_name":"Serіk"},{"first_name":"Abay","last_name":"Shulakov"},{"first_name":"Abazhanov","last_name":"Daniyar"},{"first_name":"Abdullaev","last_name":"Alizhan"},{"first_name":"Abdullah","last_name":"Tolegen"},{"first_name":"Abdumalik","last_name":"Zhandilda"},{"first_name":"Abdygaparov","last_name":"Alan"},{"first_name":"Abilasan","last_name":"Anuar"},{"first_name":"Abilda","last_name":"Aldiyar"},{"first_name":"Abulkhair","last_name":"Ertay"},{"first_name":"Abylai","last_name":"Sagitzhan"},{"first_name":"Abylaikhan","last_name":"Satbay"},{"first_name":"Abylakhan","last_name":"Toleugaly"},{"first_name":"Abylay","last_name":"Serіk"},{"first_name":"Abyseit","last_name":"Aysara"},{"first_name":"Adalin","last_name":"Medeubay"},{"first_name":"Adam","last_name":"Bettenkort"},{"first_name":"Adambay","last_name":"Alua"},{"first_name":"Adambay","last_name":"Dias"},{"first_name":"Adel","last_name":"Baiguzhanova"},{"first_name":"Adel","last_name":"Talgat"},{"first_name":"Adema","last_name":"Berkimbaeva"},{"first_name":"Adilet","last_name":"Amankeldi"},{"first_name":"Adilet","last_name":"Amirbek"},{"first_name":"Adilya","last_name":"Kalmakanova"},{"first_name":"Adilzhon","last_name":"Sopiyev"},{"first_name":"Adiya","last_name":"Gabit"},{"first_name":"Adiya","last_name":"Sabit"},{"first_name":"Adiya","last_name":"Zamanbek"},{"first_name":"Adiyar","last_name":"Sherniyaz"},{"first_name":"Adlet","last_name":"Amankul"},{"first_name":"Agnessa","last_name":"Massaliba"},{"first_name":"Aibar","last_name":"Sagit"},{"first_name":"Aibek","last_name":"Belgozhin"},{"first_name":"Aibek","last_name":"Sarsenbek"},{"first_name":"Aidarov","last_name":"Amir"},{"first_name":"Aisara","last_name":"Kasentay"},{"first_name":"Aisha","last_name":"Okhap"},{"first_name":"Aisultan","last_name":"Kidir"},{"first_name":"Aisultan","last_name":"Zhenis"},{"first_name":"Aisulu","last_name":"Ernar"},{"first_name":"Aizere","last_name":"Bakhtiyar"},{"first_name":"Aizere","last_name":"Dauletbekova"},{"first_name":"Aizere","last_name":"Murat"},{"first_name":"Akaisha","last_name":"Adilkhan"},{"first_name":"Akay","last_name":"Askar"},{"first_name":"Akazhay","last_name":"Bektemir"},{"first_name":"Akbar","last_name":"Serimbet"},{"first_name":"Akbar","last_name":"Zhandaulet"},{"first_name":"Akhada","last_name":"Aslan"},{"first_name":"Akhmad","last_name":"Nisar"},{"first_name":"Akhmetova","last_name":"Leyla"},{"first_name":"Akhmetzhan","last_name":"Kasiyev"},{"first_name":"Akimbekov","last_name":"Alan"},{"first_name":"Akmal","last_name":"Kalidoldin"},{"first_name":"Aktore","last_name":"Majambetali"},{"first_name":"Alan","last_name":"Bekbauov"},{"first_name":"Alan","last_name":"Binaliev"},{"first_name":"Alan","last_name":"Dzhumanov"},{"first_name":"Alan","last_name":"Kogamov"},{"first_name":"Alan","last_name":"Nursultan"},{"first_name":"Alan","last_name":"Nurtai"},{"first_name":"Alan","last_name":"Ospan"},{"first_name":"Alan","last_name":"Sigbatullin"},{"first_name":"Albina","last_name":"Nurbolat"},{"first_name":"Aldiyar","last_name":"Aulbekov"},{"first_name":"Aldiyar","last_name":"Erlan"},{"first_name":"Aldiyar","last_name":"Kasymov"},{"first_name":"Aldiyar","last_name":"Omarov"},{"first_name":"Aldiyar","last_name":"Tolegen"},{"first_name":"Aldiyar","last_name":"Zholdybay"},{"first_name":"Aleksandr","last_name":"Prokopenko"},{"first_name":"Aleksandr","last_name":"Shapkin"},{"first_name":"Alemger","last_name":"Kayrat"},{"first_name":"Alen","last_name":"Arkenov"},{"first_name":"Alena","last_name":"Kretova"},{"first_name":"Alesov","last_name":"Anuar"},{"first_name":"Alexander","last_name":"Roslavtsev"},{"first_name":"Alfaiz","last_name":"Kuanyshbek"},{"first_name":"Ali","last_name":"Edige"},{"first_name":"Aliaskar","last_name":"Kurbanov"},{"first_name":"Aliaskar","last_name":"Zhumabay"},{"first_name":"Alibi","last_name":"Aitkazy"},{"first_name":"Aliev","last_name":"Marlen"},{"first_name":"Alihan","last_name":"Sydykova"},{"first_name":"Alikhan","last_name":"Bakitzhan"},{"first_name":"Alikhan","last_name":"Darkhanuly"},{"first_name":"Alikhan","last_name":"Karymsakov"},{"first_name":"Alikhan","last_name":"Khalipayev"},{"first_name":"Alikhan","last_name":"Kumisbek"},{"first_name":"Alikhan","last_name":"Malik"},{"first_name":"Alikhan","last_name":"Mutay"},{"first_name":"Alikhan","last_name":"Myrzakhan"},{"first_name":"Alikhan","last_name":"Nazarov"},{"first_name":"Alikhan","last_name":"Nurbek"},{"first_name":"Alikhan","last_name":"Saginov"},{"first_name":"Alim","last_name":"Esenbekov"},{"first_name":"Alim","last_name":"Guseynov"},{"first_name":"Alim","last_name":"Khamrayev"},{"first_name":"Alim","last_name":"Nurtaev"},{"first_name":"Alima","last_name":"Nurlanova"},{"first_name":"Alimhan","last_name":"Ahmetdiyar"},{"first_name":"Alina","last_name":"Batalova"},{"first_name":"Alinur","last_name":"Bakitzhan"},{"first_name":"Alinur","last_name":"Ganiuly"},{"first_name":"Alinur","last_name":"Seitnur"},{"first_name":"Alisha","last_name":"Turgambaeva"},{"first_name":"Alisher","last_name":"Gaysin"},{"first_name":"Alisultan","last_name":"Aibekuly"},{"first_name":"Alisultan","last_name":"Asan"},{"first_name":"Aliyar","last_name":"Bakhytbek"},{"first_name":"Almasuly","last_name":"Zaid"},{"first_name":"Almat","last_name":"Mukamadi"},{"first_name":"Alnur","last_name":"Serzhan"},{"first_name":"Alnur","last_name":"Zhetyru"},{"first_name":"Alpysov","last_name":"Alemzhan"},{"first_name":"Alseit","last_name":"Kaziyev"},{"first_name":"Altair","last_name":"Kanai"},{"first_name":"Altair","last_name":"Omirbek"},{"first_name":"Altair","last_name":"Zhakupov"},{"first_name":"Altair","last_name":"Zhumabay"},{"first_name":"Altynbek","last_name":"Atamkulov"},{"first_name":"Alua","last_name":"Omar"},{"first_name":"Alua","last_name":"Sultankyzy"},{"first_name":"Aly","last_name":"Token"},{"first_name":"Aman","last_name":"Murat"},{"first_name":"Amanzhol","last_name":"Dias"},{"first_name":"Amil","last_name":"Abzal"},{"first_name":"Amin","last_name":"Maskabay"},{"first_name":"Amina","last_name":"Nurlan"},{"first_name":"Amina","last_name":"Zhalel"},{"first_name":"Amir","last_name":"Alabasov"},{"first_name":"Amir","last_name":"Assylkhan"},{"first_name":"Amir","last_name":"Auken"},{"first_name":"Amir","last_name":"Barakhat"},{"first_name":"Amir","last_name":"Boltirik"},{"first_name":"Amir","last_name":"Dzhetibayev"},{"first_name":"Amir","last_name":"Kairat"},{"first_name":"Amir","last_name":"Mukhtar"},{"first_name":"Amir","last_name":"Nurtai"},{"first_name":"Amir","last_name":"Suvankulov"},{"first_name":"Amir","last_name":"Veshagurov"},{"first_name":"Amir","last_name":"Zhanabaev"},{"first_name":"Amira","last_name":"Kuanyshek"},{"first_name":"Amira","last_name":"Mahmaraeva"},{"first_name":"Amirali","last_name":"Tanbay"},{"first_name":"Amire","last_name":"Alimbay"},{"first_name":"Amire","last_name":"Zhanatuly"},{"first_name":"Amirkhan","last_name":"Aubakirov"},{"first_name":"Amirkhan","last_name":"Bakyt"},{"first_name":"Amirkhan","last_name":"Khalipayev"},{"first_name":"Amirkhan","last_name":"Segizbay"},{"first_name":"Amirlan","last_name":"Amantay"},{"first_name":"Amirlan","last_name":"Sabdenov"},{"first_name":"Amirzhan","last_name":"Bagdolda"},{"first_name":"Amirzhan","last_name":"Isaev"},{"first_name":"Ammar","last_name":"Abdulkassimov"},{"first_name":"Amre","last_name":"Oraz"},{"first_name":"Andrey","last_name":"Bezgin"},{"first_name":"Andrey","last_name":"Ivanov"},{"first_name":"Andrey","last_name":"Kolesnikov"},{"first_name":"Andrey","last_name":"Kuznetsov"},{"first_name":"Anel","last_name":"Marat"},{"first_name":"Anel","last_name":"Raimbekova"},{"first_name":"Aneliya","last_name":"Dayirbek"},{"first_name":"Anisimova","last_name":"Irina"},{"first_name":"Aniyar","last_name":"Rakhimbek"},{"first_name":"Anna","last_name":"Kim"},{"first_name":"Ansagan","last_name":"Maulet"},{"first_name":"Ansar","last_name":"Askarov"},{"first_name":"Ansar","last_name":"Murat "},{"first_name":"Ansar","last_name":"Rym"},{"first_name":"Ansar","last_name":"Sharip"},{"first_name":"Ansar","last_name":"Tair"},{"first_name":"Anton","last_name":"Simakov"},{"first_name":"Anuar","last_name":"Khusainov"},{"first_name":"Anuar","last_name":"Sundetulla"},{"first_name":"Anvarov","last_name":"Danial"},{"first_name":"Arafat","last_name":"Kanzhikarayev"},{"first_name":"Arlan","last_name":"Aripzhanov"},{"first_name":"Arlan","last_name":"Darmenov"},{"first_name":"Arlan","last_name":"Kuatuly"},{"first_name":"Arlan","last_name":"Sabrai"},{"first_name":"Arlan","last_name":"Zholdasbek"},{"first_name":"Arman","last_name":"Alshanbayev"},{"first_name":"Armanov","last_name":"Arystan"},{"first_name":"Arnur","last_name":"Erlan"},{"first_name":"Arnur","last_name":"Esirkegen"},{"first_name":"Arnur","last_name":"Koshkarov"},{"first_name":"Arnur","last_name":"Mukamadi"},{"first_name":"Arnur","last_name":"Serzhan"},{"first_name":"Arsen","last_name":"Asanov"},{"first_name":"Arsen","last_name":"Ernatuly"},{"first_name":"Arsen","last_name":"kaldibay"},{"first_name":"Arsen","last_name":"Nurbaev"},{"first_name":"Arsen","last_name":"Zafar"},{"first_name":"Arsen","last_name":"Zhanuzak"},{"first_name":"Arslan","last_name":"Bagaev"},{"first_name":"Artem","last_name":"Baranov"},{"first_name":"Artem","last_name":"Potorochin"},{"first_name":"Artur","last_name":"Li"},{"first_name":"Artur","last_name":"Strokov"},{"first_name":"Aruzhan","last_name":"Kalmakanova"},{"first_name":"Aruzhan","last_name":"Nurlan"},{"first_name":"Aruzhan","last_name":"Sydykova"},{"first_name":"Asad","last_name":"Maksat"},{"first_name":"Asanali","last_name":"Atabay"},{"first_name":"Asanali","last_name":"Nursapa"},{"first_name":"Asanov","last_name":"Abay"},{"first_name":"Ashir","last_name":"Adi"},{"first_name":"Asilya","last_name":"Kumabaeva"},{"first_name":"Askar","last_name":"Nurgazy"},{"first_name":"Askerkhan","last_name":"Mansur"},{"first_name":"Askhatuly","last_name":"Zhebe"},{"first_name":"Aslan","last_name":"Amirkhan"},{"first_name":"Aslan","last_name":"Azimkhan"},{"first_name":"Aslan","last_name":"Erkin"},{"first_name":"Aslan","last_name":"Sattarov"},{"first_name":"Asman","last_name":"Abzal"},{"first_name":"Asylmurat","last_name":"Muratkan"},{"first_name":"Aya","last_name":"Kobeli"},{"first_name":"Ayan","last_name":"Nurlybaev"},{"first_name":"Ayapbergen","last_name":"Sami"},{"first_name":"Ayaru","last_name":"Daniyarkyzy"},{"first_name":"Aybar","last_name":"Askar"},{"first_name":"Aybar","last_name":"Kayrat"},{"first_name":"Ayim","last_name":"Sabitkhan"},{"first_name":"Aylin","last_name":"Abilekova"},{"first_name":"Ayna ","last_name":"Rizhakova"},{"first_name":"Aynabay","last_name":"Arlan"},{"first_name":"Ayrat","last_name":"Galimzyanov"},{"first_name":"Ayris","last_name":"Aimenova"},{"first_name":"Ayris","last_name":"Bakirova"},{"first_name":"Aysha","last_name":"Adilkhan"},{"first_name":"Aysultan","last_name":"Aydosuly"},{"first_name":"Aysultan","last_name":"Esimzhan"},{"first_name":"Aysultan","last_name":"Esimzhan"},{"first_name":"Aysultan","last_name":"Madiuly"},{"first_name":"Aysultan","last_name":"Marat"},{"first_name":"Aysultan","last_name":"Shayzolda"},{"first_name":"Aysulu","last_name":"Tursynbay"},{"first_name":"Aytore","last_name":"Serikbay"},{"first_name":"Azamat","last_name":"Adiya"},{"first_name":"Azamat","last_name":"Dameli"},{"first_name":"Azamat","last_name":"Zhumatay "},{"first_name":"Azim","last_name":"Suleymenov"},{"first_name":"Azimbaev","last_name":"Amirali"},{"first_name":"Babentsov","last_name":"Arseniy"},{"first_name":"Bakhitzhan","last_name":"Alan"},{"first_name":"Baknur","last_name":"Zhumabay"},{"first_name":"Balabi","last_name":"Amantay"},{"first_name":"Banu","last_name":"Bakytzhan"},{"first_name":"Batir","last_name":"Muhtar"},{"first_name":"Batyr","last_name":"Ismail"},{"first_name":"Batyrbek","last_name":"Ansar"},{"first_name":"Batyrkhan","last_name":"Raiymbek"},{"first_name":"Batyrkhan","last_name":"Turebekov"},{"first_name":"Bauyrzhan","last_name":"Esirkep"},{"first_name":"Baydildaev","last_name":"Kuanysh"},{"first_name":"Baydybek","last_name":"Tileubay"},{"first_name":"Bayram-Ali","last_name":"Malagov"},{"first_name":"Bayshuak","last_name":"Kaldykhan"},{"first_name":"Begali","last_name":"Dzhakhandiyar"},{"first_name":"Begayim","last_name":"Beysekhan"},{"first_name":"Beibaris","last_name":"Bekbergen"},{"first_name":"Bekarys","last_name":"Erkin"},{"first_name":"Bekarys","last_name":"Serikhan"},{"first_name":"Bekassyl","last_name":"Bekbolat"},{"first_name":"Bekmagambet","last_name":"Nurislam"},{"first_name":"Bekova","last_name":"Ayzere"},{"first_name":"Beksultan","last_name":"Bahtybai"},{"first_name":"Beksultan","last_name":"Bakhytzhanuly"},{"first_name":"Beksultan","last_name":"Saken"},{"first_name":"Bektas","last_name":"Toktar"},{"first_name":"Bektas","last_name":"Toktar"},{"first_name":"Bektay","last_name":"Bayansulu"},{"first_name":"Bekzhan","last_name":"Nursultanuly"},{"first_name":"Benazir","last_name":"Almas"},{"first_name":"Berkin","last_name":"Manar"},{"first_name":"Berkin","last_name":"Sanzhar"},{"first_name":"Bernar","last_name":"Nelya"},{"first_name":"Beybarys","last_name":"Akhmetbay"},{"first_name":"Beybarys","last_name":"Serikhan"},{"first_name":"Bolgozhin","last_name":"Asylkhan"},{"first_name":"Bondarenko","last_name":"Avenir"},{"first_name":"Borte","last_name":"Kaldykhan"},{"first_name":"Buenbaev","last_name":"Shakhnazar"},{"first_name":"Bulat","last_name":"Alikhan"},{"first_name":"Chikaev","last_name":"Alparslan"},{"first_name":"Chuev","last_name":"Nikita"},{"first_name":"Dalel","last_name":"Shermakhan"},{"first_name":"Daliya","last_name":"Subkhanberdina"},{"first_name":"Damelya","last_name":"Iliyasova"},{"first_name":"Damian","last_name":"Suleymenov"},{"first_name":"Damir","last_name":"Ashimov"},{"first_name":"Damir","last_name":"Dauletbay"},{"first_name":"Damir","last_name":"Iminov"},{"first_name":"Danel","last_name":"Tsay"},{"first_name":"Dania","last_name":"Sultan"},{"first_name":"Danial","last_name":"Elubay"},{"first_name":"Danial","last_name":"Kudaibergenov"},{"first_name":"Danial","last_name":"Shamsudin"},{"first_name":"Danial","last_name":"Shimbergen"},{"first_name":"Danial","last_name":"Talgat"},{"first_name":"Daniel","last_name":"Kim"},{"first_name":"Daniel","last_name":"Leyman"},{"first_name":"Daniil","last_name":"Yugay"},{"first_name":"Daniyal","last_name":"Abdygapparov"},{"first_name":"Daniyal","last_name":"Joldasbayev"},{"first_name":"Dariya","last_name":"Asan"},{"first_name":"Dariya","last_name":"Marat"},{"first_name":"Dariya","last_name":"Santarova"},{"first_name":"Darkhan","last_name":"Adilbek"},{"first_name":"Darkhanuly","last_name":"Akhmet"},{"first_name":"Daryn","last_name":"Abi"},{"first_name":"Dastan","last_name":"Bahtiarov"},{"first_name":"Daudov","last_name":"Bauyrzhan"},{"first_name":"Daulet","last_name":"Bayzhuminov"},{"first_name":"Dauletkazin","last_name":"Amirkhan"},{"first_name":"Dauren","last_name":"Toleubekov"},{"first_name":"Daut","last_name":"Daniyaruly"},{"first_name":"David","last_name":"Klopotskiy"},{"first_name":"David","last_name":"Mun"},{"first_name":"David ","last_name":"Eroshov"},{"first_name":"Demid","last_name":"Veklenko"},{"first_name":"Demir","last_name":"Al-Sara"},{"first_name":"Demyan","last_name":"Ivanov"},{"first_name":"Devlikamova","last_name":"Veronika"},{"first_name":"Diar","last_name":"Tobataev"},{"first_name":"Difuza","last_name":"Usmanova"},{"first_name":"Dilen","last_name":"Yakupov"},{"first_name":"Dina","last_name":"Yerlan"},{"first_name":"Dinmuhamed","last_name":"Seitzhan"},{"first_name":"Dinmuhamed","last_name":"Seitzhan"},{"first_name":"Dinmukhamed","last_name":"Kanatuly"},{"first_name":"Dinmukhamed","last_name":"Kuanyshbek"},{"first_name":"Dinmukhamed","last_name":"Uvaydilda"},{"first_name":"Dinmukhammed","last_name":"Marat"},{"first_name":"Diyar","last_name":"Berdaly"},{"first_name":"Diyar","last_name":"Kaziyev"},{"first_name":"Diyar","last_name":"Torekhan"},{"first_name":"Dmitriy","last_name":"Kolesnik"},{"first_name":"Dmitry","last_name":"Kan"},{"first_name":"Dubinina","last_name":"Milana"},{"first_name":"Dursun","last_name":"Malagov"},{"first_name":"Dzaurov","last_name":"Idris"},{"first_name":"Dzhakupov","last_name":"Dinmukhammed"},{"first_name":"Dzhulmukhammedov","last_name":"Ablay"},{"first_name":"Edige","last_name":"Kaldykhan"},{"first_name":"Ekaterina","last_name":"Kim"},{"first_name":"Elaris","last_name":"Berdikhan"},{"first_name":"Eldar","last_name":"Batyrbek"},{"first_name":"Eldar","last_name":"Khalitov"},{"first_name":"Eldes","last_name":"Konysbek"},{"first_name":"Elhan","last_name":"Ashken"},{"first_name":"Elizaveta","last_name":"Shumilova"},{"first_name":"Elnar","last_name":"Nabiyev"},{"first_name":"Emil","last_name":"Akhunzyanov"},{"first_name":"Emil","last_name":"Gammer"},{"first_name":"Emir","last_name":"Arshidinov"},{"first_name":"Emirali","last_name":"Muhametkali"},{"first_name":"Enlik","last_name":"Serikhan"},{"first_name":"Eraly","last_name":"Aysultan"},{"first_name":"Erasyl","last_name":"Zhanturin"},{"first_name":"Ermek","last_name":"Aru"},{"first_name":"Ermek","last_name":"Salakhaddin"},{"first_name":"Ersin","last_name":"Seifl"},{"first_name":"Ersultan","last_name":"Rahatuly"},{"first_name":"Ertay","last_name":"Daniyar"},{"first_name":"Ertay","last_name":"Zurabuly"},{"first_name":"Erzhan","last_name":"Amir"},{"first_name":"Erzhanov","last_name":"Daniyar"},{"first_name":"Esenova","last_name":"Maryam"},{"first_name":"Esenova","last_name":"Yasmina"},{"first_name":"Eshimov","last_name":"Toktar"},{"first_name":"Eskendir","last_name":"Kartabay"},{"first_name":"Eskendir","last_name":"Nurlanov"},{"first_name":"Esmagambetova","last_name":"Narmin"},{"first_name":"Esmagambetova","last_name":"Yasmin"},{"first_name":"Esmakhan","last_name":"KhanymAy"},{"first_name":"Eva","last_name":"Mulyukova"},{"first_name":"Farabi","last_name":"Burankulov"},{"first_name":"Fatima","last_name":"Bakyt"},{"first_name":"Fatyma","last_name":"Bakit"},{"first_name":"Fedor","last_name":"Lopatin"},{"first_name":"Ferdeus","last_name":"Kidirbek"},{"first_name":"Gaitov","last_name":"Salahaddin"},{"first_name":"Galachenko","last_name":"Zlata"},{"first_name":"Ganiev","last_name":"Alem"},{"first_name":"George","last_name":"Badenko"},{"first_name":"Georgiy","last_name":"Grechkin"},{"first_name":"Gleb","last_name":"Chizhikov"},{"first_name":"Golovakha","last_name":"Georgiy"},{"first_name":"Grigoriy","last_name":"Orlov"},{"first_name":"Habib","last_name":"Gasanov"},{"first_name":"Hanafiya","last_name":"Rustem"},{"first_name":"Ibrahim","last_name":"Kuttikozha"},{"first_name":"Ibrahim","last_name":"Naurizbay"},{"first_name":"Ibrahim","last_name":"Sarsen"},{"first_name":"Ibrahim","last_name":"Zhaksylik"},{"first_name":"Ibrakhim","last_name":"Nalibay"},{"first_name":"Ibrakhim","last_name":"Zhaksybay"},{"first_name":"Idris","last_name":"Kulybekov"},{"first_name":"Ilya","last_name":"Khodakov"},{"first_name":"Ilyas","last_name":"Malik"},{"first_name":"Ilyas","last_name":"Sagyngali"},{"first_name":"Ilyas","last_name":"Tore"},{"first_name":"Imanali","last_name":"Bauyrzhan"},{"first_name":"Imangali","last_name":"Alikhan"},{"first_name":"Imran","last_name":"Iliyarov"},{"first_name":"Imran","last_name":"Nalibay"},{"first_name":"Imran","last_name":"Rakhmatullaev"},{"first_name":"Inkar","last_name":"Musabekova"},{"first_name":"Insar","last_name":"Arnur uly"},{"first_name":"Isa","last_name":"Garipov"},{"first_name":"Iskakov","last_name":"Aslan"},{"first_name":"Iskaziev","last_name":"Bernar"},{"first_name":"Islam","last_name":"Iskanderov"},{"first_name":"Islam","last_name":"Shadiev"},{"first_name":"Ismail","last_name":"Aliev"},{"first_name":"Ismail","last_name":"Tarasenko"},{"first_name":"Ismatulla","last_name":"Abdrimov"},{"first_name":"Ivan","last_name":"Mischenko"},{"first_name":"Kadyrbek","last_name":"Ayan"},{"first_name":"Kaiyrzhan","last_name":"Olzhas"},{"first_name":"Kalambayev","last_name":"Zhanibek"},{"first_name":"Kalkaman","last_name":"Zurabuly"},{"first_name":"Kamila","last_name":"Sayfullova"},{"first_name":"Karim","last_name":"Akhmadiyev"},{"first_name":"Karim","last_name":"Aliev"},{"first_name":"Karim","last_name":"Bulat"},{"first_name":"Karymsak","last_name":"Amandyk"},{"first_name":"Karymsak","last_name":"Zhaksylyk"},{"first_name":"Kasymhan","last_name":"Eskender"},{"first_name":"Kasymkhan","last_name":"Iskander"},{"first_name":"Kateryna","last_name":"Sadykh-pur"},{"first_name":"Kausar","last_name":"Bekmuhamet"},{"first_name":"Kausar","last_name":"Serik"},{"first_name":"Kausar","last_name":"Zhumaniaz"},{"first_name":"Kaysar","last_name":"Bauyrzhan"},{"first_name":"Kazina","last_name":"Tolbasy"},{"first_name":"Kazybek","last_name":"Zhetpis"},{"first_name":"Kemel","last_name":"Zhaksylyk"},{"first_name":"Khabi","last_name":"Akmyrza"},{"first_name":"Khakim","last_name":"Sakenov"},{"first_name":"Khaknazar","last_name":"Skendyrbek"},{"first_name":"Khalikova","last_name":"Ilana"},{"first_name":"Khalin","last_name":"Daniil"},{"first_name":"Khan","last_name":"Tore"},{"first_name":"KhanTlek","last_name":"Esmahan"},{"first_name":"Khazret","last_name":"Kayrat"},{"first_name":"Khokhryakova","last_name":"Leya"},{"first_name":"Khusainova","last_name":"Diana"},{"first_name":"Kibarov","last_name":"Khalit"},{"first_name":"Kira","last_name":"Chikayeva"},{"first_name":"Kirill","last_name":"Pshenichnikov"},{"first_name":"Kochubey","last_name":"Darya"},{"first_name":"Kogan","last_name":"Mark"},{"first_name":"Kokhan","last_name":"Ioana"},{"first_name":"Konev","last_name":"Alan"},{"first_name":"Konovalov","last_name":"Yaroslav"},{"first_name":"Korotin","last_name":"Aleksandr"},{"first_name":"Koshanov","last_name":"Alan"},{"first_name":"Koshanov","last_name":"Dias"},{"first_name":"Koshkarova","last_name":"Sabira"},{"first_name":"Koval","last_name":"Artem"},{"first_name":"Kozbagarov","last_name":"Mark"},{"first_name":"Kuanysh","last_name":"Bakkulov"},{"first_name":"Kuanysh","last_name":"Orymbay"},{"first_name":"Kubay","last_name":"Tauman"},{"first_name":"Kulumbetova","last_name":"Aisha"},{"first_name":"Kuralay","last_name":"Dulatkyzy"},{"first_name":"Kurmanov","last_name":"Timur"},{"first_name":"Kutlimetov","last_name":"Rolan"},{"first_name":"Lachin","last_name":"Arshidinov"},{"first_name":"Lali","last_name":"Nizamedinova"},{"first_name":"Latifa","last_name":"Almas"},{"first_name":"Lelina","last_name":"Eva"},{"first_name":"Leonid","last_name":"Popov"},{"first_name":"Leonov","last_name":"Nikita"},{"first_name":"Li","last_name":"Evgeniy"},{"first_name":"Litvinenko","last_name":"Taisiya"},{"first_name":"Lyaisan","last_name":"Akhmadiyeva"},{"first_name":"Madi","last_name":"Sharubekov"},{"first_name":"Madina","last_name":"Kabylbekova"},{"first_name":"Madotov","last_name":"Malikshakh"},{"first_name":"Magzhan","last_name":"Isa"},{"first_name":"Magzum","last_name":"Malik"},{"first_name":"Makar","last_name":"Chumakov"},{"first_name":"Makar","last_name":"Leskov"},{"first_name":"Makariy","last_name":"Nozdrin"},{"first_name":"Makarov","last_name":"Ivan"},{"first_name":"Maksim","last_name":"Li"},{"first_name":"Malika","last_name":"Malik"},{"first_name":"Malika","last_name":"Maratova"},{"first_name":"Malika","last_name":"Sayfutdinova"},{"first_name":"Mamedov","last_name":"Ruben"},{"first_name":"Mansur","last_name":"Alzhan"},{"first_name":"Mansur","last_name":"Aselov"},{"first_name":"Mansur","last_name":"Muhtar"},{"first_name":"Mansur","last_name":"Sagyngali"},{"first_name":"Marat","last_name":"Kuvangali"},{"first_name":"Margulan","last_name":"Atymtay"},{"first_name":"Mariam","last_name":"Zhanasova"},{"first_name":"Mariyam","last_name":"Toleubekova"},{"first_name":"Mark","last_name":"Mitin"},{"first_name":"Mark","last_name":"Ten"},{"first_name":"Maryam","last_name":"Adilkhan"},{"first_name":"Maryam","last_name":"Bulazova"},{"first_name":"Maryam","last_name":"Moldakhmet"},{"first_name":"Masimov","last_name":"Aisultan"},{"first_name":"Matusevich","last_name":"Lev"},{"first_name":"Matvey","last_name":"Chetyrkin"},{"first_name":"Matvey","last_name":"Maslennikov"},{"first_name":"Medet","last_name":"Malikov"},{"first_name":"Meruert","last_name":"Kuanyshbek"},{"first_name":"Meyirim","last_name":"Khudaykul"},{"first_name":"Meyirzhan","last_name":"Mukhit"},{"first_name":"Milana","last_name":"Chernogor"},{"first_name":"Miron","last_name":"Pavluchenko"},{"first_name":"Miron","last_name":"Tarasov"},{"first_name":"Miya","last_name":"Tsay"},{"first_name":"Moldabekov","last_name":"Miras"},{"first_name":"Mombekov","last_name":"Dosym"},{"first_name":"Muhammed","last_name":"Murat"},{"first_name":"Mukagali","last_name":"Nurmukhamat"},{"first_name":"Mukhamedzhan","last_name":"Anuar"},{"first_name":"Mukhametkerim","last_name":"Dinislam"},{"first_name":"Mukhammed","last_name":"Nogaybay"},{"first_name":"Mukhammed ALi","last_name":"Kemelbay"},{"first_name":"Mukhammedmansur","last_name":"Abzhanov"},{"first_name":"Mukhammedzhan","last_name":"Turgan"},{"first_name":"Mumina","last_name":"Assylbek"},{"first_name":"Mun","last_name":"Timur"},{"first_name":"Mun","last_name":"Veronika"},{"first_name":"Murat","last_name":"Abdrakhman"},{"first_name":"Murat","last_name":"Zeyin"},{"first_name":"Muratuly","last_name":"Diyar"},{"first_name":"Mustafa","last_name":"Suyin"},{"first_name":"Myrzakhmet","last_name":"Alira"},{"first_name":"Nadezhda","last_name":"Kim"},{"first_name":"Nailya","last_name":"Alieva"},{"first_name":"Nariman","last_name":"Nurtoleu"},{"first_name":"Natan","last_name":"Dadamyan"},{"first_name":"Naumenkov","last_name":"Maksim"},{"first_name":"Nazar","last_name":"Agabek"},{"first_name":"Nazar","last_name":"Yurov"},{"first_name":"Nazym","last_name":"Rakulova"},{"first_name":"Nikiporets","last_name":"Afina"},{"first_name":"Nikita","last_name":"Bolukh"},{"first_name":"Nikita","last_name":"Kan"},{"first_name":"Nikita","last_name":"Kim"},{"first_name":"Nikol","last_name":"Ibraeva"},{"first_name":"Nurakhmet","last_name":"Batyrbek"},{"first_name":"Nurali","last_name":"Bokentai"},{"first_name":"Nurali","last_name":"Maksut"},{"first_name":"Nurali","last_name":"Menlibay"},{"first_name":"Nurali","last_name":"Sagatov"},{"first_name":"Nurali","last_name":"Toselbaev"},{"first_name":"Nurali","last_name":"Zhantemirov"},{"first_name":"Nuray","last_name":"Orynbasar"},{"first_name":"Nurbolat","last_name":"Ilyas"},{"first_name":"Nurdaulet","last_name":"Adilbaev"},{"first_name":"Nuriman","last_name":"Abdilda"},{"first_name":"Nurislam","last_name":"Bereket"},{"first_name":"Nurlat","last_name":"Dzhamankulov"},{"first_name":"Nurmukhamed","last_name":"Nurym"},{"first_name":"Nursultan","last_name":"Beybarys"},{"first_name":"Nursultan","last_name":"Kanatuly"},{"first_name":"Nurymkul","last_name":"Alibi"},{"first_name":"Nurzhan","last_name":"Amankeldi"},{"first_name":"Ochkin","last_name":"Dany"},{"first_name":"Oleg","last_name":"Chizhikov"},{"first_name":"Omar","last_name":"Kablanbek"},{"first_name":"Omar","last_name":"Sagatov"},{"first_name":"Ormantay","last_name":"Alikhan"},{"first_name":"Oserbay","last_name":"Dinmukhamed"},{"first_name":"Pak","last_name":"Maksim"},{"first_name":"Partsikyan","last_name":"Sergey"},{"first_name":"Pavlushin","last_name":"Timur"},{"first_name":"Pochevalov","last_name":"Timur"},{"first_name":"Potashov","last_name":"Saveliy"},{"first_name":"Qanat","last_name":"Arsen"},{"first_name":"Rail","last_name":"Paltushev"},{"first_name":"Ramadan","last_name":"Dvumar"},{"first_name":"Ramazan","last_name":"Abish"},{"first_name":"Ramazan","last_name":"Beldibek"},{"first_name":"Ramazan","last_name":"Dzhusupbekov"},{"first_name":"Ramazan","last_name":"Kamet"},{"first_name":"Ramazan","last_name":"Nurdaulet"},{"first_name":"Ramazan","last_name":"Zhazken"},{"first_name":"Ramzan","last_name":"Korganbaev"},{"first_name":"Raniya","last_name":"Bekhukhambetova"},{"first_name":"Raniya","last_name":"Toleubekova"},{"first_name":"Rashid","last_name":"Alan"},{"first_name":"Rashid","last_name":"Aydan"},{"first_name":"Ratmir","last_name":"Ryabichev"},{"first_name":"Rauan","last_name":"Sarsenbek"},{"first_name":"Rauana","last_name":"Bolat"},{"first_name":"Rauanuly","last_name":"Kerey"},{"first_name":"Rayana","last_name":"Altynbekkyzy"},{"first_name":"Rayimbek","last_name":"Sayfutdinov"},{"first_name":"Robert","last_name":"Mirdzhalilov"},{"first_name":"Rollan","last_name":"Rodin"},{"first_name":"Rushchuk","last_name":"Makar"},{"first_name":"Ruslan","last_name":"Toktarbaev"},{"first_name":"Rymbaeva","last_name":"Aysana"},{"first_name":"Ryspay","last_name":"Zhantore"},{"first_name":"Sabina","last_name":"Rakhimzhanova"},{"first_name":"Sabina","last_name":"Sayfullova"},{"first_name":"Sabirova","last_name":"Afina"},{"first_name":"Sabirova","last_name":"Zere"},{"first_name":"Sabyr","last_name":"Zurabuly"},{"first_name":"Saenko","last_name":"Lev"},{"first_name":"Safiya","last_name":"Bagdat"},{"first_name":"Safiya","last_name":"Kim"},{"first_name":"Sakenov","last_name":"Alikhan"},{"first_name":"Sakenov","last_name":"Temirlan"},{"first_name":"Sakizhan","last_name":"Alan"},{"first_name":"Salikhova","last_name":"Dina"},{"first_name":"Samatov","last_name":"Alikhan"},{"first_name":"Samir","last_name":"Medeu"},{"first_name":"Samira","last_name":"Nurlam"},{"first_name":"Sanzhar","last_name":"Erik"},{"first_name":"Sanzhar","last_name":"Kabylbek"},{"first_name":"Sanzhar","last_name":"Shaymerdinov"},{"first_name":"Saparbay","last_name":"Alikhan"},{"first_name":"Sara","last_name":"Dinmukhambetkyzy"},{"first_name":"Sara","last_name":"Suyin"},{"first_name":"Sarsen","last_name":"Daryn"},{"first_name":"Sauran","last_name":"Gabdelkamal"},{"first_name":"Saya","last_name":"Iliyas"},{"first_name":"Seitov","last_name":"Aldiyar"},{"first_name":"Sembiev","last_name":"Iskander"},{"first_name":"Sergey","last_name":"Manko"},{"first_name":"Serikov","last_name":"Yeskender"},{"first_name":"Serikpay","last_name":"Umar"},{"first_name":"Seydakhmet","last_name":"Zeyin"},{"first_name":"Seytbek","last_name":"Altair"},{"first_name":"Seytzhan","last_name":"Dinmukhammed"},{"first_name":"Seytzhan","last_name":"Ibragim"},{"first_name":"Seytzhan","last_name":"Magzum"},{"first_name":"Seytzhan","last_name":"Muslim"},{"first_name":"Sezym","last_name":"Zhaksybay"},{"first_name":"Shakarim","last_name":"Amirov"},{"first_name":"Shakhbalaeva","last_name":"Diana"},{"first_name":"Shakhkarim","last_name":"Omirbekuly"},{"first_name":"Shaltykov","last_name":"Nazar"},{"first_name":"Shapovalov","last_name":"Leo"},{"first_name":"Shapovalov","last_name":"Mark"},{"first_name":"Shchukin","last_name":"Eduard"},{"first_name":"Shumskiy","last_name":"Egor"},{"first_name":"Shyngys","last_name":"Khabdimalik"},{"first_name":"Smbatyan","last_name":"Liza"},{"first_name":"Sofiya","last_name":"Kardapoltseva"},{"first_name":"Sofiya","last_name":"Kretova"},{"first_name":"Stepan","last_name":"Belokopytov"},{"first_name":"Suleyman","last_name":"Tabylganov"},{"first_name":"Sultanbek","last_name":"Dastan"},{"first_name":"Sungat","last_name":"Nurym"},{"first_name":"Sushchenko","last_name":"Adelina"},{"first_name":"Sushchikh","last_name":"Liza"},{"first_name":"Syrym","last_name":"Tattibek"},{"first_name":"Tagir","last_name":"Syzdykov"},{"first_name":"Tair","last_name":"Dzhetibayev"},{"first_name":"Tair","last_name":"Mustafin"},{"first_name":"Taisiya","last_name":"Jakovenko DAMUBALA"},{"first_name":"Taizhanova","last_name":"Saida"},{"first_name":"Talgat","last_name":"Aisultan"},{"first_name":"Talgat","last_name":"Alizhan"},{"first_name":"Tamendarov","last_name":"Aleksandr"},{"first_name":"Tamerlan","last_name":"Batalov"},{"first_name":"Tamerlan","last_name":"Smagulov"},{"first_name":"Tamiris","last_name":"Mels"},{"first_name":"Tanirkhan","last_name":"Zhumagaly"},{"first_name":"Tasimov","last_name":"Mansur"},{"first_name":"Temirali","last_name":"Zhantore"},{"first_name":"Temirlan","last_name":"Akimguzhin"},{"first_name":"Tenilan","last_name":"Denisov"},{"first_name":"Tileuberdi","last_name":"Ayқyn"},{"first_name":"Tileuberdi","last_name":"Ilyas"},{"first_name":"Timofey","last_name":"Gaponov"},{"first_name":"Timofey","last_name":"Simonov"},{"first_name":"Timur","last_name":"Amirov"},{"first_name":"Timur","last_name":"Dosbaev"},{"first_name":"Timur","last_name":"Gutorov"},{"first_name":"Tleubay","last_name":"Bayken"},{"first_name":"Tleugabul","last_name":"Isa"},{"first_name":"Togzhan","last_name":"Batyrkhan"},{"first_name":"Tomiris","last_name":"Saken"},{"first_name":"Tulendinova","last_name":"Aysulu"},{"first_name":"Turabay","last_name":"Ali"},{"first_name":"Turguldinov","last_name":"Raiymbek"},{"first_name":"Turkiashvili","last_name":"Aleksandre"},{"first_name":"Tursyn","last_name":"Alisher"},{"first_name":"Tyo","last_name":"Alan"},{"first_name":"Ulan","last_name":"Bolatkhan"},{"first_name":"Ulan","last_name":"Toktar"},{"first_name":"Umaev","last_name":"Umar"},{"first_name":"Ustyuzhanina","last_name":"Ekaterina"},{"first_name":"Vera","last_name":"Charusova"},{"first_name":"Vikram","last_name":"Altair"},{"first_name":"Viktoriya","last_name":"Pogodayeva"},{"first_name":"Vladislav","last_name":"Din"},{"first_name":"Voronkov","last_name":"Artemiy"},{"first_name":"Vyacheslav","last_name":"Barkov"},{"first_name":"Vyacheslav","last_name":"Ten"},{"first_name":"Yaila","last_name":"Osmanov"},{"first_name":"Yakushev","last_name":"Artem"},{"first_name":"Yan","last_name":"Poletskiy"},{"first_name":"Yana","last_name":"Chagay"},{"first_name":"Yaroslav","last_name":"Kozyrev"},{"first_name":"Yaroslav","last_name":"Romanov"},{"first_name":"Yasmin","last_name":"Maksat"},{"first_name":"Ybyrai","last_name":"Nurlanov"},{"first_name":"Yedige","last_name":"Tursynkan"},{"first_name":"Zaid","last_name":"Almas"},{"first_name":"Zakariya","last_name":"Tursynbay"},{"first_name":"Zakhar","last_name":"Osipov"},{"first_name":"Zangar","last_name":"Kulimbet"},{"first_name":"Zarap","last_name":"Timur"},{"first_name":"Zarina","last_name":"Bolatkhanova"},{"first_name":"Zein","last_name":"Berik"},{"first_name":"Zere","last_name":"Beibit"},{"first_name":"Zere","last_name":"Suyin"},{"first_name":"Zeyin","last_name":"Murat"},{"first_name":"Zhalyn","last_name":"Zhumabek"},{"first_name":"Zhan","last_name":"Smaylov"},{"first_name":"Zhanabay","last_name":"Arsen"},{"first_name":"Zhanali","last_name":"Nietzhan"},{"first_name":"Zhanasyl","last_name":"Zhalel"},{"first_name":"Zhanel","last_name":"Murtazina"},{"first_name":"Zhangir","last_name":"Isbasarov"},{"first_name":"Zhangir","last_name":"Kazhimurat "},{"first_name":"Zhangir","last_name":"Maldybayev"},{"first_name":"Zhangir","last_name":"Serik"},{"first_name":"Zhaniya","last_name":"Sabit"},{"first_name":"Zhasmin","last_name":"Arman"},{"first_name":"Zhasmin","last_name":"Kuvangali"},{"first_name":"Zhasmin","last_name":"Odinaeva"},{"first_name":"Zhasmin","last_name":"Zhumabay"},{"first_name":"Zhaushybay","last_name":"Kasen"},{"first_name":"Zhazitov","last_name":"Mansur"},{"first_name":"Zhazitov","last_name":"Mukhammad"},{"first_name":"Zhomart","last_name":"Abylaikhanuly"},{"first_name":"Zhumabaev","last_name":"Sultan"},{"first_name":"Zhumagulov","last_name":"Sultangazy"},{"first_name":"Zinchenko","last_name":"Aleksandr"}];

// Fuzzy match function (from admin.js)
function fuzzyMatchStudent(excelName, students) {
    if (!excelName || !students || students.length === 0) {
        return { matched: false, student: null, confidence: 0 };
    }

    const normalizedExcel = excelName.trim().toLowerCase();
    const parts = normalizedExcel.split(/\s+/).filter(p => p.length > 0);

    // Try exact match first
    for (const student of students) {
        const firstName = (student.first_name || '').toLowerCase();
        const lastName = (student.last_name || '').toLowerCase();
        const fullName1 = `${lastName} ${firstName}`;
        const fullName2 = `${firstName} ${lastName}`;

        if (normalizedExcel === fullName1 || normalizedExcel === fullName2) {
            return { matched: true, student, confidence: 100 };
        }
    }

    // Try partial match with improved validation (80% confidence)
    // Configuration constants
    const MIN_SUBSTRING_LENGTH = 4;        // Prevent "ali" (3 chars) matches
    const MIN_TOKEN_SIMILARITY = 0.75;     // 75% for spelling variations
    const MIN_WHOLE_NAME_SIMILARITY = 0.80; // 80% overall similarity

    for (const student of students) {
        const firstName = (student.first_name || '').toLowerCase();
        const lastName = (student.last_name || '').toLowerCase();
        const studentParts = [firstName, lastName];

        let matchedTokens = 0;

        // Check each CSV name part against student name parts
        for (const part of parts) {
            let tokenMatched = false;

            for (const sp of studentParts) {
                if (!sp || sp.length === 0) continue;

                // Case 1: Exact token match
                if (part === sp) {
                    tokenMatched = true;
                    break;
                }

                // Case 2: Substring match WITH length threshold
                if (part.length >= MIN_SUBSTRING_LENGTH && sp.includes(part)) {
                    tokenMatched = true;
                    break;
                } else if (sp.length >= MIN_SUBSTRING_LENGTH && part.includes(sp)) {
                    tokenMatched = true;
                    break;
                }

                // Case 3: Levenshtein similarity for spelling variations
                const distance = levenshteinDistance(part, sp);
                const maxLen = Math.max(part.length, sp.length);
                const similarity = (maxLen - distance) / maxLen;

                if (similarity >= MIN_TOKEN_SIMILARITY && maxLen >= MIN_SUBSTRING_LENGTH) {
                    tokenMatched = true;
                    break;
                }
            }

            if (tokenMatched) matchedTokens++;
        }

        // Require ALL tokens matched + whole-name validation
        if (matchedTokens === parts.length && parts.length >= 2) {
            // Final validation: Check whole-name similarity
            const fullName1 = `${firstName} ${lastName}`;
            const fullName2 = `${lastName} ${firstName}`;

            const dist1 = levenshteinDistance(normalizedExcel, fullName1);
            const dist2 = levenshteinDistance(normalizedExcel, fullName2);
            const minDist = Math.min(dist1, dist2);
            const maxLen = Math.max(normalizedExcel.length, fullName1.length);
            const wholeSimilarity = (maxLen - minDist) / maxLen;

            // Accept only if overall similarity is high
            if (wholeSimilarity >= MIN_WHOLE_NAME_SIMILARITY) {
                return { matched: true, student, confidence: 80 };
            }
        }
    }

    // Try matching with variations
    for (const student of students) {
        const firstName = (student.first_name || '').toLowerCase();
        const lastName = (student.last_name || '').toLowerCase();

        if (parts.some(p => p === firstName) || parts.some(p => p === lastName)) {
            const otherParts = parts.filter(p => p !== firstName && p !== lastName);
            if (otherParts.length === 0 || otherParts.some(p =>
                firstName.includes(p) || lastName.includes(p) || p.includes(firstName) || p.includes(lastName)
            )) {
                return { matched: true, student, confidence: 60 };
            }
        }
    }

    return { matched: false, student: null, confidence: 0 };
}

// Read CSV
const csvContent = fs.readFileSync('/home/marblemaster/Downloads/рейтинг 26.01.2026.xlsx - Лист2.csv', 'utf-8');
const lines = csvContent.split('\n').slice(1);

const ratings = [];
for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lastComma = trimmed.lastIndexOf(',');
    if (lastComma === -1) continue;

    const name = trimmed.substring(0, lastComma).trim();
    const rating = parseInt(trimmed.substring(lastComma + 1).trim());

    if (name && !isNaN(rating)) {
        ratings.push({ name, rating });
    }
}

console.log('='.repeat(80));
console.log('RATING MATCH ANALYSIS');
console.log('='.repeat(80));
console.log(`\nDatabase Statistics:`);
console.log(`  Total students in database: ${students.length}`);
console.log(`  Total ratings in CSV file: ${ratings.length}`);

let exactMatches = 0;
let partialMatches = 0;
let lowConfidenceMatches = 0;
let unmatched = 0;
const unmatchedList = [];
const partialMatchList = [];

ratings.forEach((rating, idx) => {
    const matchResult = fuzzyMatchStudent(rating.name, students);

    if (matchResult.matched) {
        if (matchResult.confidence === 100) {
            exactMatches++;
        } else if (matchResult.confidence >= 80) {
            partialMatches++;
            partialMatchList.push({
                index: idx + 1,
                csvName: rating.name,
                dbName: `${matchResult.student.first_name} ${matchResult.student.last_name}`,
                rating: rating.rating,
                confidence: matchResult.confidence
            });
        } else {
            lowConfidenceMatches++;
        }
    } else {
        unmatched++;
        unmatchedList.push(`${idx + 1}. ${rating.name} (${rating.rating})`);
    }
});

console.log(`\nMatch Results:`);
console.log(`  ✓ Exact matches (100%):      ${exactMatches}`);
console.log(`  ⚠ Partial matches (80%):     ${partialMatches}`);
console.log(`  ⚠ Low confidence (60%):      ${lowConfidenceMatches}`);
console.log(`  ✗ Unmatched:                 ${unmatched}`);
console.log(`\nTotal Matched:                 ${exactMatches + partialMatches + lowConfidenceMatches} (${Math.round((exactMatches + partialMatches + lowConfidenceMatches) / ratings.length * 100)}%)`);

if (partialMatchList.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('PARTIAL MATCHES (80% confidence):');
    console.log('='.repeat(80));
    console.log('CSV Name                          => Database Name                     Rating');
    console.log('-'.repeat(80));
    partialMatchList.forEach(match => {
        const csvNamePadded = match.csvName.padEnd(33);
        const dbNamePadded = match.dbName.padEnd(33);
        console.log(`${csvNamePadded} => ${dbNamePadded} ${match.rating}`);
    });
}

if (unmatchedList.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('UNMATCHED STUDENTS (will not be imported):');
    console.log('='.repeat(80));
    unmatchedList.slice(0, 50).forEach(entry => console.log(entry));
    if (unmatchedList.length > 50) {
        console.log(`... and ${unmatchedList.length - 50} more`);
    }
}

console.log('\n' + '='.repeat(80));
