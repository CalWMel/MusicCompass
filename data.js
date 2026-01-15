const MUSIC_LIBRARY = [
    {
        name: "Rock",
        audio: "assets/rock.mp3", // The "Musicon" for the Genre
        children: [
            { name: "Queen", audio: "assets/queen.mp3" },
            { name: "Nirvana", audio: "assets/nirvana.mp3" },
            { name: "AC/DC", audio: "assets/acdc.mp3" },
            { name: "Pink Floyd", audio: "assets/pink-floyd.mp3" },
            { name: "Led Zeppelin", audio: "assets/led-zeppelin.mp3" },
            { name: "The Rolling Stones", audio: "assets/the-rolling-stones.mp3" },
            { name: "The Beatles", audio: "assets/the-beatles.mp3" },
            { name: "The Who", audio: "assets/the-who.mp3" }
        ]
    },
    {
        name: "Pop",
        audio: "assets/pop.mp3",
        children: [
            { name: "Taylor Swift", audio: "assets/pop.mp3" },

            // TARGET 1: MICHAEL JACKSON (Has Tracks)
            { 
                name: "Michael Jackson", 
                audio: "assets/mj_preview.mp3", 
                children: [
                    { name: "Billie Jean", audio: "assets/billie-jean.mp3" },
                    { name: "Thriller", audio: "assets/thriller.mp3" },
                    { name: "Beat It", audio: "assets/beat-it.mp3" },
                    { name: "Smooth Criminal", audio: "assets/smooth-criminal.mp3" },
                    { name: "Bad", audio: "assets/bad.mp3" },
                    { name: "Man in the Mirror", audio: "assets/man-in-the-mirror.mp3" },
                    { name: "Black or White", audio: "assets/black-or-white.mp3" },
                    { name: "The Way You Make Me Feel", audio: "assets/the-way-you-make-me-feel.mp3" }
                ] 
            },
            { name: "Madonna", audio: "assets/pop.mp3" },
            { name: "Beyonce", audio: "assets/pop.mp3" },
            { name: "Lady Gaga", audio: "assets/pop.mp3" },
            { name: "Justin Bieber", audio: "assets/pop.mp3" },
            { name: "Rihanna", audio: "assets/pop.mp3" },
            { name: "Katy Perry", audio: "assets/pop.mp3" }
        ]
    },
    {
        name: "HipHop",
        audio: "assets/hiphop.mp3",
        children: [
            { name: "Kendrick Lamar", audio: "assets/hiphop.mp3" },
            { name: "Drake", audio: "assets/hiphop.mp3" },
            { name: "J. Cole", audio: "assets/hiphop.mp3" },
            { name: "Nicki Minaj", audio: "assets/hiphop.mp3" },
            { name: "Cardi B", audio: "assets/hiphop.mp3" },
            { name: "Travis Scott", audio: "assets/hiphop.mp3" },
            { name: "Lil Wayne", audio: "assets/hiphop.mp3" },
            { name: "Post Malone", audio: "assets/hiphop.mp3" }
        ]
    },
    {
        name: "Jazz",
        audio: "assets/jazz.mp3",
        children: [
            { name: "Miles Davis", audio: "assets/jazz.mp3" },
            { name: "John Coltrane", audio: "assets/jazz.mp3" },
            { name: "Ella Fitzgerald", audio: "assets/jazz.mp3" },
            { name: "Louis Armstrong", audio: "assets/jazz.mp3" },
            { name: "Duke Ellington", audio: "assets/jazz.mp3" },
            { name: "Charlie Parker", audio: "assets/jazz.mp3" },
            { name: "Billie Holiday", audio: "assets/jazz.mp3" },
            { name: "Thelonious Monk", audio: "assets/jazz.mp3" }
        ]
    },
    {
        name: "Classical",
        audio: "assets/classical.mp3",
        children: [
            { name: "Ludwig van Beethoven", audio: "assets/classical.mp3" },
            { name: "Johann Sebastian Bach", audio: "assets/classical.mp3" },
            { name: "Wolfgang Amadeus Mozart", audio: "assets/classical.mp3" },
            { name: "Frédéric Chopin", audio: "assets/classical.mp3" },
            { name: "Pyotr Ilyich Tchaikovsky", audio: "assets/classical.mp3" },
            { name: "Antonio Vivaldi", audio: "assets/classical.mp3" },
            { name: "Johannes Brahms", audio: "assets/classical.mp3" },
            { name: "Claude Debussy", audio: "assets/classical.mp3" }
        ]
    },
    {
        name: "Metal",
        audio: "assets/metal.mp3",
        children: [
            { name: "Iron Maiden", audio: "assets/metal.mp3" },
            { name: "Black Sabbath", audio: "assets/metal.mp3" },
            { name: "Judas Priest", audio: "assets/metal.mp3" },
            { name: "Slipknot", audio: "assets/metal.mp3" },
            { name: "Megadeth", audio: "assets/metal.mp3" },
            { name: "Anthrax", audio: "assets/metal.mp3" },
            { name: "Pantera", audio: "assets/metal.mp3" },
            { name: "System of a Down", audio: "assets/metal.mp3" }
        ]
    },
    {
        name: "Electronic",
        audio: "assets/electronic.mp3",
        children: [
            { name: "Calvin Harris", audio: "assets/electronic.mp3" },
            { name: "Skrillex", audio: "assets/electronic.mp3" },
            { name: "Deadmau5", audio: "assets/electronic.mp3" },
            { name: "David Guetta", audio: "assets/electronic.mp3" },
            { name: "Marshmello", audio: "assets/electronic.mp3" },

            // TARGET 2: DAFT PUNK (Has Tracks)
            { 
                name: "Daft Punk", 
                audio: "assets/daftpunk_preview.mp3", 
                children: [
                    { name: "Get Lucky", audio: "assets/get-lucky.mp3" },
                    { name: "Harder Better Faster", audio: "assets/harder-better-faster.mp3" },
                    { name: "One More Time", audio: "assets/one-more-time.mp3" },
                    { name: "Around the World", audio: "assets/around-the-world.mp3" },
                    { name: "Face To Face", audio: "assets/face-to-face.mp3" },
                    { name: "Instant Crush", audio: "assets/instant-crush.mp3" },
                    { name: "Lose Yourself to Dance", audio: "assets/lose-yourself-to-dance.mp3" },
                    { name: "Robot Rock", audio: "assets/robot-rock.mp3" }
                ] 
            },
            { name: "Tiesto", audio: "assets/electronic.mp3" },
            { name: "Avicii", audio: "assets/electronic.mp3" }
        ]
    },
    {
        name: "Folk",
        audio: "assets/folk.mp3",
        children: [
            { name: "Bob Dylan", audio: "assets/folk.mp3" },
            { name: "Joni Mitchell", audio: "assets/folk.mp3" },
            { name: "Simon & Garfunkel", audio: "assets/folk.mp3" },
            { name: "Joan Baez", audio: "assets/folk.mp3" },
            { name: "Neil Young", audio: "assets/folk.mp3" },
            { name: "Crosby, Stills & Nash", audio: "assets/folk.mp3" },
            { name: "Cat Stevens", audio: "assets/folk.mp3" },
            { name: "Pete Seeger", audio: "assets/folk.mp3" }
        ]
    }
];