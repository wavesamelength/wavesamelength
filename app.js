// ======================================
// MAPTAP LEAGUE APPLICATION LOGIC
// ======================================


import { db } from "./firebase.js";


import {

    collection,
    doc,
    setDoc,
    getDocs,
    getDoc,
    onSnapshot,
    query,
    orderBy

}

from

"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";





// ======================================
// SETTINGS
// ======================================


const POINTS = [
    9,
    8,
    7,
    6,
    5,
    4,
    3,
    2,
    1
];



let players = [];





// ======================================
// LOAD PLAYERS
// ======================================


async function loadPlayers(){


    const snapshot = await getDocs(
        collection(
            db,
            "players"
        )
    );


    players = [];


    snapshot.forEach((doc)=>{

        players.push(
            doc.id
        );

    });



    createResultInputs();


}





// ======================================
// CREATE DAILY INPUTS
// ======================================


function createResultInputs(){


    const container =
        document.getElementById(
            "result-entry"
        );


    container.innerHTML = "";



    for(
        let i = 0;
        i < POINTS.length;
        i++
    ){


        const row =
        document.createElement(
            "div"
        );


        row.className =
            "result-row";



        row.innerHTML = `


        <label>
            ${i+1}️⃣
        </label>


        <select class="player-select">


            <option value="">
                Choose player
            </option>


            ${
                players.map(player=>`

                    <option value="${player}">
                        ${player}
                    </option>

                `).join("")
            }


        </select>


        `;



        container.appendChild(row);


    }



}





// ======================================
// SAVE DAILY RESULTS
// ======================================


document
.getElementById(
    "save-results"
)
.addEventListener(
"click",

async ()=>{


    const selections =
        [
            ...document.querySelectorAll(
                ".player-select"
            )
        ]
        .map(
            select=>select.value
        );




    if(
        selections.includes("")
    ){

        alert(
            "Please choose every position"
        );

        return;

    }




    const duplicates =
        new Set(
            selections
        ).size
        !==
        selections.length;



    if(duplicates){


        alert(
            "A player cannot appear twice"
        );


        return;

    }





    const today =
        new Date()
        .toISOString()
        .split("T")[0];




    await setDoc(

        doc(
            db,
            "results",
            today
        ),

        {


            date:
                today,


            placements:
                selections,


            week:
                getWeekNumber(
                    new Date()
                )


        }

    );



    alert(
        "Results saved!"
    );


});








// ======================================
// LIVE LEADERBOARD
// ======================================


function listenForResults(){


onSnapshot(

    collection(
        db,
        "results"
    ),


    snapshot=>{


        calculateLeaderboard(
            snapshot.docs
        );


    }


);


}








async function calculateLeaderboard(results){


    let scores = {};


    players.forEach(player=>{

        scores[player] = 0;

    });



    const currentWeek =
        getLeagueWeek();



    results.forEach(result=>{


        const data =
            result.data();



        // Only count current week
        if(
            data.week !== currentWeek
        ){
            return;
        }



        data.placements
        .forEach(
            (player,index)=>{


                scores[player]
                +=
                POINTS[index];


            }
        );


    });




    const sorted =

        Object.entries(scores)

        .sort(
            (a,b)=>
            b[1]-a[1]
        );



    renderLeaderboard(
        sorted
    );



    checkWinner(
        sorted
    );
// ======================================
// PREVIOUS WINNERS HISTORY
// ======================================


async function loadPreviousWinners(){


    const historyDiv =
        document.getElementById(
            "history"
        );



    const snapshot =
        await getDocs(
            collection(
                db,
                "results"
            )
        );



    const weeks = {};



    const currentWeek =
        getLeagueWeek();




    snapshot.forEach(result=>{


        const data =
            result.data();



        if(
            data.week === currentWeek
        ){

            return;

        }



        if(
            !weeks[data.week]
        ){

            weeks[data.week] = [];

        }



        weeks[data.week]
        .push(data);



    });





    historyDiv.innerHTML = "";



    const weekEntries =
        Object.entries(
            weeks
        )
        .sort(
            (a,b)=>
            new Date(b[0])
            -
            new Date(a[0])
        );





    if(
        weekEntries.length === 0
    ){

        historyDiv.innerHTML =
        `
        No completed weeks yet 🗺️
        `;


        return;

    }





    weekEntries.forEach(
        ([week,results])=>{


            let scores = {};



            players.forEach(player=>{

                scores[player]=0;

            });





            results.forEach(day=>{


                day.placements
                .forEach(
                    (player,index)=>{


                        scores[player]
                        +=
                        POINTS[index];


                    }
                );


            });





            const winner =

                Object.entries(scores)

                .sort(
                    (a,b)=>
                    b[1]-a[1]
                )[0];







            const card =
                document.createElement(
                    "div"
                );



            card.className =
                "history-item";



            card.innerHTML = `


            <strong>
            Week starting ${week}
            </strong>


            <br>


            🏆 ${winner[0]}


            <br>


            ${winner[1]} points


            <hr>


            `;



            historyDiv.appendChild(card);



        }

    );


}

}


;





    const sorted =

        Object.entries(scores)

        .sort(
            (a,b)=>
            b[1]-a[1]
        );



    renderLeaderboard(
        sorted
    );



    checkWinner(
        sorted
    );
// ======================================
// PREVIOUS WINNERS HISTORY
// ======================================


async function loadPreviousWinners(){


    const historyDiv =
        document.getElementById(
            "history"
        );



    const snapshot =
        await getDocs(
            collection(
                db,
                "results"
            )
        );



    const weeks = {};



    const currentWeek =
        getLeagueWeek();




    snapshot.forEach(result=>{


        const data =
            result.data();



        if(
            data.week === currentWeek
        ){

            return;

        }



        if(
            !weeks[data.week]
        ){

            weeks[data.week] = [];

        }



        weeks[data.week]
        .push(data);



    });





    historyDiv.innerHTML = "";



    const weekEntries =
        Object.entries(
            weeks
        )
        .sort(
            (a,b)=>
            new Date(b[0])
            -
            new Date(a[0])
        );





    if(
        weekEntries.length === 0
    ){

        historyDiv.innerHTML =
        `
        No completed weeks yet 🗺️
        `;


        return;

    }





    weekEntries.forEach(
        ([week,results])=>{


            let scores = {};



            players.forEach(player=>{

                scores[player]=0;

            });





            results.forEach(day=>{


                day.placements
                .forEach(
                    (player,index)=>{


                        scores[player]
                        +=
                        POINTS[index];


                    }
                );


            });





            const winner =

                Object.entries(scores)

                .sort(
                    (a,b)=>
                    b[1]-a[1]
                )[0];







            const card =
                document.createElement(
                    "div"
                );



            card.className =
                "history-item";



            card.innerHTML = `


            <strong>
            Week starting ${week}
            </strong>


            <br>


            🏆 ${winner[0]}


            <br>


            ${winner[1]} points


            <hr>


            `;



            historyDiv.appendChild(card);



        }

    );


}





// ======================================
// DISPLAY LEADERBOARD
// ======================================


function renderLeaderboard(data){


const table =
document.getElementById(
    "leaderboard"
);



table.innerHTML="";



data.forEach(
(player,index)=>{


const row =
document.createElement(
"tr"
);



row.innerHTML=`

<td>
${index+1}
</td>


<td>
${player[0]}
</td>


<td>
${player[1]}
</td>

`;



table.appendChild(row);


});


}









// ======================================
// WEEKLY WINNER
// ======================================


function checkWinner(sorted){


const today =
new Date()
.getDay();



//
// Tuesday = 2
//

if(
today !== 2
)
return;



const winner =
sorted[0];



const card =
document.getElementById(
"winner-card"
);



card.classList.remove(
"hidden"
);



document
.getElementById(
"winner-name"
)
.innerText =
winner[0];



document
.getElementById(
"winner-score"
)
.innerText =
`${winner[1]} points`;



}









// ======================================
// WEEK NUMBER
// ======================================


function getLeagueWeek(){

    const now = new Date();


    //
    // Wednesday is the start
    // of a new MapTap week
    //

    const day =
        now.getDay();



    const daysSinceWednesday =
        (
            day + 5
        ) % 7;



    const weekStart =
        new Date(now);



    weekStart.setDate(
        now.getDate()
        -
        daysSinceWednesday
    );



    return weekStart
        .toISOString()
        .split("T")[0];

}








// ======================================
// START APP
// ======================================


loadPlayers();

listenForResults();

loadPreviousWinners();
