import produce from "./src/index"

const baseState = [
    {
        todo: "Learn typescript",
        done: true
    },
    {
        todo: "Try immer",
        done: false
    }
]

const nextState = produce(baseState, draftState => {
    draftState.push({ todo: "Tweet about it" })
    draftState[1].done = true
})

console.log('baseState', baseState);
console.log('nextState', nextState);

// const mapper = produce((draft, index) => {
//     draft.index = index
// })

// // example usage
// console.dir([{}, {}, {}].map(mapper))