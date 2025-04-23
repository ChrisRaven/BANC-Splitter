// ==UserScript==
// @name         Splitter for BANC
// @namespace    KrzysztofKruk-BANC
// @version      0.2
// @description  Splits large list of IDs to more managable batches
// @author       Krzysztof Kruk
// @match        https://spelunker.cave-explorer.org/*
// @match        https://cave.fanc-fly.com/*
// @connect      spelunker.cave-explorer.org.com
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ChrisRaven/BANC-Splitter/main/Splitter.user.js
// @downloadURL  https://raw.githubusercontent.com/ChrisRaven/BANC-Splitter/main/Splitter.user.js
// @homepageURL  https://github.com/ChrisRaven/BANC-Splitter
// ==/UserScript==
/*global Dock, BigInt, viewer */
/*eslint no-return-assign: "off"*/

let storage
let currentPosition = 0
let batchSize = 20
let numberOfSaved = 0
let refreshEvery = 100
let ids = []

function addCss() {
  Dock.addCss(/*css*/`
    /* "Next" button */
    #kk-splitter-next-wrapper {
      position: absolute;
      z-index: 50;
      width: 220px;
      height: 90px;
      display: flex;
      flex-direction: row;
      align-items: stretch;
    }

    #kk-splitter-next-batch,
    #kk-splitter-save-left,
    #kk-splitter-prev {
      background-color: #449;
      color: orange;
      font-size: 28px;
      border: 1px solid #444;
      cursor: pointer;
    }

    #kk-splitter-next-batch {
      width: 130px;
      height: 90px;
      flex: 1;
    }

    #kk-splitter-save-left,
    #kk-splitter-prev {
      width: 80px;
      height: 90px;
      font-size: 18px;
      position: relative;
    }

    #kk-side-column {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      top: -9px;
    }

    #kk-splitter-next-batch:hover,
    #kk-splitter-save-left:hover,
    #kk-splitter-prev:hover {
      background-color: #669;
    }

    #kk-splitter-next-batch-total-counter {
      font-size: 12px;
    }

    /* "Manage" dialog */
    #kk-splitter-manage-dialog #kk-splitter-input {
      width: 230px;
      height: 100px;
    }

    #kk-splitter-manage-dialog #kk-splitter-button-wrapper {
      text-align: center;
      margin: 10px;
      width: 220px;
    }

    #kk-splitter-manage-dialog #kk-splitter-batch-size-label {
      display: inline-block;
      font-size: 12px;
      margin: 0 5px 0 26px;
    }

    #kk-splitter-refresh-every-label {
      font-size: 14px;
      margin: 10px 0;
    }

    #kk-splitter-manage-dialog #kk-splitter-batch-size,
    #kk-splitter-manage-dialog #kk-splitter-refresh-every {
      height: 25px;
      width: 25px;
      text-align: center;
    }

    #kk-splitter-manage-dialog #kk-splitter-button-wrapper button {
      margin: 3px;
    }

    #kk-splitter-manage-dialog button#kk-splitter-get-stored,
    #kk-splitter-manage-dialog button#kk-splitter-get-saved,
    #kk-splitter-manage-dialog button#kk-splitter-clear-stored,
    #kk-splitter-manage-dialog button#kk-splitter-clear-saved {
      width: 90px;
    }

    #kk-splitter-manage-dialog button#kk-splitter-clear-stored,
    #kk-splitter-manage-dialog button#kk-splitter-clear-saved {
      background-color: #ef3166;
    }

    #kk-splitter-manage-dialog button#kk-splitter-clear-stored:hover,
    #kk-splitter-manage-dialog button#kk-splitter-clear-saved:hover {
      box-shadow: 0 0 0.5em #f15480;
    }

    .kk-splitter-counter-label {
      font-size: 14px;
      text-align: left;
      margin: 5px 0 5px 25px;
    }

    .kk-splitter-counter {
      color: orange;
    }
  `)
}

const observer = new MutationObserver(() => {
  const el = document.getElementById('neuroglancer-status-container');
  if (el) {
    const text = el.textContent || "";
    if (text.includes('Hid ') || text.includes('Deselected ')) {
      el.style.display = 'none';
    } else {
      el.style.display = '';
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });


document.addEventListener('dock-ready', () => {
  addCss()
  main()
  addNextButton()
})

if (!document.getElementById('dock-script')) {
  let script = document.createElement('script')
  script.id = 'dock-script'
  script.src = typeof DEV !== 'undefined' ? 'http://127.0.0.1:5501/BANC-Dock/Dock.js' : 'https://chrisraven.github.io/BANC-Dock/Dock.js'
  document.head.appendChild(script)
}

// on the Next button
function setStillToDo(clear = false) {
  const newValue = clear ? 0 : Math.ceil((ids.length - currentPosition) / batchSize)
  document.querySelector('#kk-splitter-next-batch-total-counter').textContent = `[${newValue}]`
}

function addNextButton() {
  const nextButtonWrapper = document.createElement('div')
  nextButtonWrapper.id = 'kk-splitter-next-wrapper'
  nextButtonWrapper.draggable = true

  const prevButton = document.createElement('button')
  prevButton.id = 'kk-splitter-prev'
  prevButton.innerHTML = 'Prev'
  prevButton.addEventListener('contextmenu', e => e.preventDefault())

  const nextButton = document.createElement('button')
  nextButton.id = 'kk-splitter-next-batch'
  nextButton.innerHTML = 'Next (<span id="kk-splitter-next-batch-batch-number">0</span>)<br /><span id="kk-splitter-next-batch-total-counter">[?]</span>'
  nextButton.addEventListener('contextmenu', e => e.preventDefault())

  const sideColumn = document.createElement('div')
  sideColumn.id = 'kk-side-column'

  const saveLeftButton = document.createElement('button')
  saveLeftButton.id = 'kk-splitter-save-left'
  saveLeftButton.textContent = 'Save left'
  saveLeftButton.addEventListener('contextmenu', e => e.preventDefault())

  nextButtonWrapper.appendChild(nextButton)
  nextButtonWrapper.appendChild(sideColumn)
  sideColumn.appendChild(prevButton)
  sideColumn.appendChild(saveLeftButton)
  document.body.appendChild(nextButtonWrapper)

  storage.get('kk-splitter-next-button-position').then(res => {
    let top, left
    let position = res['kk-splitter-next-button-position']
    if (!position) {
      top = 300
      left = 300
    }
    else {
      top = position.y
      left = position.x
    }

    nextButtonWrapper.style.top = top + 'px'
    nextButtonWrapper.style.left = left + 'px'
  })

  let clickCounter = 0

  function refresh() {
    viewer.selectedLayer.layer_.layer_.displayState.segmentationGroupState.value.selectedSegments.clear()
    localStorage.setItem('clickNext', true)
    setTimeout(() => window.location.reload(), 0) // TODO: check if still necessary to timeout
  }

  function addIds(layer, ids) {
    layer.layer_.displayState.segmentationGroupState.value.selectedSegments.clear()
    layer.layer_.displayState.segmentationGroupState.value.selectedSegments.add(ids)
    layer.layer_.displayState.segmentationGroupState.value.visibleSegments.add(ids)
  }

  function getCurrentBatch() {
    const currentEndPosition = currentPosition + batchSize
    const batch = ids.slice(currentPosition, currentEndPosition)

    viewer.selectedLayer.layer_.layer_.displayState.segmentationGroupState.value.selectedSegments.clear()

    if (!batch.length) {
      return Dock.dialog({
        id: 'kk-splitter-no-ids',
        html: 'All IDs have been checked',
        destroyAfterClosing: true,
        okLabel: 'OK',
        okCallback: () => {}
      }).show()

    }
    else {
      const numberOfPreloadedBatches = 2
      setStillToDo()
      const nextBatch = ids.slice(currentEndPosition, currentEndPosition + batchSize * numberOfPreloadedBatches) // preloading dla dwóch następnych porcji
      hiddenLayer.layer_.displayState.segmentationGroupState.value.selectedSegments.clear()
      if (nextBatch && nextBatch.length && clickCounter + numberOfPreloadedBatches <= refreshEvery) {
        addIds(hiddenLayer, nextBatch)
      }
      addIds(viewer.selectedLayer.layer_, batch)
    }

    currentPosition += batchSize
    storage.set('kk-splitter-current-position', currentPosition)
    setStillToDo()
    document.getElementById('kk-splitter-next-batch-batch-number').textContent = clickCounter
  }

  nextButton.addEventListener('click', e => {
    if (clickCounter === refreshEvery) {
      return refresh()
    }
    clickCounter++
    getCurrentBatch()
  })

  prevButton.addEventListener('click', e => {
    currentPosition -= batchSize * 2
    if (currentPosition < 0) {
      currentPosition = 0
      // we have to save the currentPosition only here, because in the other branch, the getCurrentBatch() will already do it for us
      storage.set('kk-splitter-current-position', currentPosition)
    }
    else {
      clickCounter--
      getCurrentBatch()
    }
  })

  saveLeftButton.addEventListener('click', () => {
    const newIds = []
    const segments = document.querySelectorAll('.neuroglancer-segment-list-entry-id')
    segments.forEach(seg => newIds.push(seg.innerText))
    let savedIds = []

    if (!newIds || !newIds.length) return

    storage.get('kk-splitter-saved').then(res => {
      savedIds = res['kk-splitter-saved'] || []

      let batch
      while ((batch = newIds.splice(0, 10000)).length) {
        savedIds.push(...batch)
      }

      storage.set('kk-splitter-saved', savedIds).then(() => {
        segments.forEach(seg => seg.click())
      })
    })
  })

  let initialX, initialY
  let currentX, currentY
  let moving = false

  const nextWrapper = document.getElementById('kk-splitter-next-wrapper')

  nextWrapper.addEventListener('mousedown', e => {
    if (e.button !== 2) return
    e.preventDefault()

    initialX = e.clientX - nextWrapper.offsetLeft
    initialY = e.clientY - nextWrapper.offsetTop
    moving = true
  })

  nextWrapper.addEventListener('mousemove', e => {
    if (!moving) return
    if (e.buttons !== 2) return

    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    nextWrapper.style.left = currentX + 'px';
    nextWrapper.style.top = currentY + 'px';
  })

  nextWrapper.addEventListener('mouseup', e => {
    if (e.button !== 2) return

    moving = false
    storage.set('kk-splitter-next-button-position', {x: currentX, y: currentY})
  })
}

let hiddenLayer

function getIds(id) {
  let ids = document.getElementById(id).value
  return ids.split(/[ ,\n]+/).map(str => BigInt(str)).filter(num => num !== BigInt(0)) // source: ChatGPT
}


function main() {
  let dock = new Dock()
  storage = window.Sifrr.Storage.getStorage('indexeddb')

  storage.get('kk-splitter-current-position').then(res => {
    let curPos = res['kk-splitter-current-position']
    if (curPos) {
      currentPosition = curPos
    }
  })

  storage.get('kk-splitter-batch-size').then(res => {
    let size = res['kk-splitter-batch-size']
    if (size) {
      batchSize = size
    }
  })

  storage.get('kk-splitter-refresh-every').then(res => {
    let val = res['kk-splitter-refresh-every']
    if (val) {
      refreshEvery = val
    }
  })

  storage.get('kk-splitter-stored').then(res => {
    let stored = res['kk-splitter-stored']
    if (stored) {
      ids = stored
      setStillToDo()

      if (localStorage.getItem('clickNext') === 'true') {
        localStorage.setItem('clickNext', false)
        const checkForLayer = setInterval(() => {
          if (viewer && viewer.selectedLayer && viewer.selectedLayer.layer_.layer_.displayState) {
            clearInterval(checkForLayer)
            document.getElementById('kk-splitter-next-batch').click()
          }
        }, 100)
      }
    }
  })

  storage.get('kk-splitter-saved').then(res => {
    let saved = res['kk-splitter-saved']
    if (saved) {
      numberOfSaved = saved.length
    }
  })

  const checkForViewer = setInterval(() => {
    if (!viewer) return

    clearInterval(checkForViewer)
    initHiddenLayer()
  }, 100)

  function initHiddenLayer() {
    hiddenLayer = viewer.layerManager.getLayerByName(' ')
  }

  dock.addAddon({
    name: 'Splitter',
    id: 'kk-splitter',
    html: '<button id="kk-splitter-manage">Manage</button>'
  })

  document.getElementById('kk-splitter-manage').addEventListener('click', () => {
    Dock.dialog({
      width: 240,
      id: 'kk-splitter-manage-dialog',
      html: getSplitterDialogHtml(),
      afterCreateCallback: () => {
        setInitialValues()
        addEvents()
      },
      okCallback: () => {},
      okLabel: 'Close',
      destroyAfterClosing: true
    }).show()
  })

  function getSplitterDialogHtml() {
    return /*html*/`
      <textarea id="kk-splitter-input"></textarea>
      <div id="kk-splitter-button-wrapper">
        <button id="kk-splitter-add">Add</button><span id="kk-splitter-batch-size-label">Batch size</span><input id="kk-splitter-batch-size" />
        <div id="kk-splitter-refresh-every-label">Refresh every <input id="kk-splitter-refresh-every" default=100> "Next" clicks</div>
        <button id="kk-splitter-get-stored">Get stored</button>
        <button id="kk-splitter-get-saved">Get saved</button>
        <button id="kk-splitter-clear-stored">Clear stored</button>
        <button id="kk-splitter-clear-saved">Clear saved</button>
        <div class="kk-splitter-counter-label">Number of stored: <span id="kk-splitter-stored-counter" class="kk-splitter-counter">0</span></div>
        <div class="kk-splitter-counter-label">Number of saved: <span id="kk-splitter-saved-counter" class="kk-splitter-counter">0</span></div>
      </div>
    `
  }

  function setTotalLength() {
    document.getElementById('kk-splitter-stored-counter').textContent = ids.length
  }

  function setSavedCounter(val) {
    document.getElementById('kk-splitter-saved-counter').textContent = val
    numberOfSaved = val
  }

  function setInitialValues() {
    document.getElementById('kk-splitter-batch-size').value = batchSize
    document.getElementById('kk-splitter-refresh-every').value = refreshEvery
    setTotalLength()
    setSavedCounter(numberOfSaved)
  }

  function addEvents() {
    document.getElementById('kk-splitter-batch-size').addEventListener('input', e => {
      const val = parseInt(e.target.value, 10)
      if (isNaN(val)) {
        Dock.dialog({
          id: 'kk-splitter-incorrect-batch-size-dialog',
          html: 'Incorrect value',
          okLabel: 'OK',
          okCallback: () => e.target.value = 20,
          destroyAfterClosing: true
        }).show()
      }
      else {
        batchSize = val
        storage.set('kk-splitter-batch-size', batchSize)
      }
    })

    document.getElementById('kk-splitter-refresh-every').addEventListener('input', e => {
      const val = parseInt(e.target.value, 10)

      if (isNaN(val)) {
        Dock.dialog({
          id: 'kk-splitter-incorrect-refresh-every-dialog',
          html: 'Incorrect value',
          okLabel: 'OK',
          okCallback: () => e.target.value = 20,
          destroyAfterClosing: true
        }).show()
      }
      else {
        refreshEvery = val
        storage.set('kk-splitter-refresh-every', refreshEvery)
      }
    })


    document.getElementById('kk-splitter-add').addEventListener('click', () => {
      const newIds = getIds('kk-splitter-input')
      ids = [...newIds]
      let stored
      storage.get('kk-splitter-stored').then(res => {
        stored = res['kk-splitter-stored'] || []

        let batch = newIds.splice(0, 10000)
        do {
        stored.push(...batch)
        batch = newIds.splice(0, 10000)
        }
        while (batch.length > 0)

        storage.set('kk-splitter-stored', stored)
      }).then(() => {
        setTotalLength()
        setStillToDo()
      })

      document.getElementById('kk-splitter-input').value = ''
    })


    document.getElementById('kk-splitter-get-stored').addEventListener('click', () => {
      storage.get('kk-splitter-stored').then(res => {
        const ids = res['kk-splitter-stored'] || []
        navigator.clipboard.writeText(ids.join(',')).then(() => {
          Dock.dialog({
            id: 'kk-splitter-get-stored-dialog',
            html: `Copied ${ids.length} IDs to the clipboard`,
            okLabel: 'OK',
            okCallback: () => {},
            destroyAfterClosing: true
          }).show()
        })

      })
    })


    document.getElementById('kk-splitter-clear-stored').addEventListener('click', () => {
      Dock.dialog({
        id: 'kk-splitter-clear-stored-confirmation-dialog',
        html: 'Do you really want to clear the stored IDs?',
        okLabel: 'Yes',
        okCallback: okCallback,
        cancelLabel: 'No',
        cancelCallback: () => {},
        destroyAfterClosing: true
      }).show()

      function okCallback() {
        storage.del('kk-splitter-stored').then(() => {
          Dock.dialog({
            id: 'kk-splitter-clear-stored-confirmed-dialog',
            html: 'The stored IDs have been removed',
            okCallback: () => {},
            okLabel: 'OK',
            destroyAfterClosing: true
          }).show()
          ids = []
          currentPosition = 0

          setTotalLength()
          setStillToDo(true)
        })
      }
    })


    document.getElementById('kk-splitter-get-saved').addEventListener('click', () => {
      storage.get('kk-splitter-saved').then(res => {
        const ids = res['kk-splitter-saved'] || []
        navigator.clipboard.writeText(ids.join(',')).then(() => {
          Dock.dialog({
            id: 'kk-splitter-get-saved-dialog',
            html: `Copied ${ids.length} IDs to the clipboard`,
            okLabel: 'OK',
            okCallback: () => {},
            destroyAfterClosing: true
          }).show()
        })

      })
    })


    document.getElementById('kk-splitter-clear-saved').addEventListener('click', () => {
      Dock.dialog({
        id: 'kk-splitter-clear-saved-confirmation-dialog',
        html: 'Do you really want to clear the saved IDs?',
        okLabel: 'Yes',
        okCallback: okCallback,
        cancelLabel: 'No',
        cancelCallback: () => {},
        destroyAfterClosing: true
      }).show()

      function okCallback() {
        storage.del('kk-splitter-saved').then(() => {
          Dock.dialog({
            id: 'kk-splitter-clear-saved-confirmed-dialog',
            html: 'The saved IDs have been removed',
            okCallback: () => {},
            okLabel: 'OK',
            destroyAfterClosing: true
          }).show()
          setSavedCounter(0)
        })
      }
    })
  }
}
