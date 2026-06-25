(function () {
  var workbookRows = [];
  var cleanedRows = [];
  var excelHeaders = [];
  var logTable = null;

  var UPDATE_BATCH_SIZE = 1000;
  var COMMON_COLLECTIONS = ["items", "item", "products", "product", "prices", "price", "inventory", "stock"];
  var ITEM_ID_FIELDS = ["itemID", "itemId", "item_id", "id", "code", "itemCode", "item_code"];

  function getDatabase() {
    if (typeof database !== "undefined") {
      return database;
    }

    if (typeof firebase !== "undefined" && firebase.database) {
      return firebase.database();
    }

    throw new Error("Firebase database is not initialized.");
  }

  function setProgress(percent) {
    var safePercent = Math.max(0, Math.min(100, percent));
    $("#progressBar").css("width", safePercent + "%").text(safePercent + "%");
  }

  function setSummary(message, type) {
    var className = type ? "mt-3 text-" + type : "mt-3";
    $("#summary").attr("class", className).text(message);
  }

  function cleanItemId(value) {
    return String(value == null ? "" : value).trim().replace(/[^a-zA-Z0-9]/g, "");
  }

  function parsePrice(value) {
    if (typeof value === "number") {
      return value;
    }

    var cleaned = String(value == null ? "" : value).replace(/[^0-9.-]/g, "");
    var parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeHeader(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function pickDefaultHeader(candidates) {
    var normalizedCandidates = candidates.map(normalizeHeader);

    for (var i = 0; i < excelHeaders.length; i++) {
      if (normalizedCandidates.indexOf(normalizeHeader(excelHeaders[i])) !== -1) {
        return excelHeaders[i];
      }
    }

    return "";
  }

  function fillMappingSelects() {
    var options = '<option value="">Select Excel column</option>';

    excelHeaders.forEach(function (header) {
      options += '<option value="' + escapeHtml(header) + '">' + escapeHtml(header) + "</option>";
    });

    $(".mapping-select").html(options);
    $("#itemIdField").val(pickDefaultHeader(["itemID", "item id", "item_id", "item code", "code"]));
    $("#itemNameField").val(pickDefaultHeader(["item_name", "item name", "name", "product name"]));
    $("#newPriceField").val(pickDefaultHeader(["new_price", "new price", "price", "rate", "mrp"]));
    $("#qtyField").val(pickDefaultHeader(["QTY", "qty", "quantity", "stock", "stock qty"]));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function readExcelFile(file) {
    var reader = new FileReader();

    reader.onload = function (event) {
      setProgress(45);

      var data = new Uint8Array(event.target.result);
      var workbook = XLSX.read(data, { type: "array" });
      var firstSheet = workbook.Sheets[workbook.SheetNames[0]];

      workbookRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
      cleanedRows = [];
      excelHeaders = workbookRows.length ? Object.keys(workbookRows[0]) : [];

      if (!workbookRows.length || !excelHeaders.length) {
        $("#fieldMapping").hide();
        $("#updateDb").hide();
        $("#output").text("");
        setProgress(0);
        setSummary("No rows were found in the Excel file.", "danger");
        return;
      }

      fillMappingSelects();
      $("#fieldMapping").show();
      $("#updateDb").hide();
      $("#output").text("");
      setProgress(100);
      setSummary("Excel file loaded. Match the Excel columns to the database fields, then preview the data.", "success");
    };

    reader.onerror = function () {
      setProgress(0);
      setSummary("Could not read the Excel file.", "danger");
    };

    reader.readAsArrayBuffer(file);
  }

  function buildCleanedRows() {
    var itemIdField = $("#itemIdField").val();
    var itemNameField = $("#itemNameField").val();
    var newPriceField = $("#newPriceField").val();
    var qtyField = $("#qtyField").val();

    if (!itemIdField || !itemNameField || !newPriceField) {
      setSummary("Please match itemID, item_name, and new_price before previewing.", "danger");
      return [];
    }

    return workbookRows.map(function (row, index) {
      var itemID = cleanItemId(row[itemIdField]);
      var newPrice = parsePrice(row[newPriceField]);

      return {
        row_number: index + 2,
        itemID: itemID,
        item_name: String(row[itemNameField] == null ? "" : row[itemNameField]).trim(),
        QTY: qtyField ? String(row[qtyField] == null ? "" : row[qtyField]).trim() : "",
        new_price: newPrice,
        status: !itemID ? "Invalid itemID" : newPrice === null ? "Invalid price" : "Ready"
      };
    });
  }

  function previewMatchedRows() {
    cleanedRows = buildCleanedRows();

    if (!cleanedRows.length) {
      return;
    }

    var readyCount = cleanedRows.filter(function (row) {
      return row.status === "Ready";
    }).length;
    var previewRows = cleanedRows.slice(0, 25).map(function (row) {
      var previewRow = {
        item_id: row.itemID,
        item_name: row.item_name,
        new_price: row.new_price
      };

      if (row.QTY) {
        previewRow.QTY = row.QTY;
      }

      return previewRow;
    });

    $("#output").text(JSON.stringify(previewRows, null, 2));
    $("#updateDb").toggle(readyCount > 0);
    setSummary("Preview ready: " + readyCount + " of " + cleanedRows.length + " rows can be updated.", readyCount ? "success" : "danger");
  }

  function initLogTable() {
    if ($.fn.DataTable && !logTable) {
      logTable = $("#logTable").DataTable({
        data: [],
        columns: [
          { title: "Item ID", data: "itemID" },
          { title: "Item Name", data: "item_name" },
          { title: "QTY", data: "QTY" },
          { title: "Old Price Set To", data: "old_price" },
          { title: "New Price", data: "new_price" },
          { title: "Status", data: "status" }
        ]
      });
    }
  }

  function renderLog(rows) {
    if (logTable) {
      logTable.clear().rows.add(rows).draw();
      return;
    }

    $("#logTable").html(
      "<thead><tr><th>Item ID</th><th>Item Name</th><th>QTY</th><th>Old Price Set To</th><th>New Price</th><th>Status</th></tr></thead><tbody>" +
        rows.map(function (row) {
          return "<tr><td>" + escapeHtml(row.itemID) + "</td><td>" + escapeHtml(row.item_name) + "</td><td>" + escapeHtml(row.QTY) + "</td><td>" + escapeHtml(row.old_price) + "</td><td>" + escapeHtml(row.new_price) + "</td><td>" + escapeHtml(row.status) + "</td></tr>";
        }).join("") +
      "</tbody>"
    );
  }

  function updateSubmitProgress(counts, totalRows) {
    var percent = totalRows ? Math.round((counts.processed / totalRows) * 100) : 0;

    $("#progressBar")
      .css("width", percent + "%")
      .text(counts.processed + " / " + totalRows + " rows");

    setSummary(
      "Processing: " + counts.processed + " of " + totalRows +
        " Excel rows. Updated: " + counts.updated +
        ", Created: " + counts.created +
        ", Skipped: " + counts.skipped +
        ", Failed: " + counts.failed + ".",
      counts.failed ? "warning" : "info"
    );
  }

  function cleanCompare(value) {
    return cleanItemId(value).toLowerCase();
  }

  function findRecord(rootSnapshot, itemID) {
    var exactId = cleanCompare(itemID);

    if (rootSnapshot.child(itemID).exists()) {
      return rootSnapshot.child(itemID);
    }

    for (var i = 0; i < COMMON_COLLECTIONS.length; i++) {
      var directChild = rootSnapshot.child(COMMON_COLLECTIONS[i]).child(itemID);
      if (directChild.exists()) {
        return directChild;
      }
    }

    var found = null;

    rootSnapshot.forEach(function (firstLevelSnapshot) {
      if (found) {
        return true;
      }

      if (cleanCompare(firstLevelSnapshot.key) === exactId) {
        found = firstLevelSnapshot;
        return true;
      }

      var firstLevelValue = firstLevelSnapshot.val();

      if (firstLevelValue && typeof firstLevelValue === "object" && recordHasItemId(firstLevelValue, exactId)) {
        found = firstLevelSnapshot;
        return true;
      }

      firstLevelSnapshot.forEach(function (secondLevelSnapshot) {
        if (found) {
          return true;
        }

        var secondLevelValue = secondLevelSnapshot.val();

        if (cleanCompare(secondLevelSnapshot.key) === exactId || recordHasItemId(secondLevelValue, exactId)) {
          found = secondLevelSnapshot;
          return true;
        }
      });
    });

    return found;
  }

  function getCreateRef(rootSnapshot, itemID) {
    for (var i = 0; i < COMMON_COLLECTIONS.length; i++) {
      if (rootSnapshot.child(COMMON_COLLECTIONS[i]).exists()) {
        return rootSnapshot.ref.child(COMMON_COLLECTIONS[i]).child(itemID);
      }
    }

    return rootSnapshot.ref.child(itemID);
  }

  function recordHasItemId(record, exactId) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return false;
    }

    return ITEM_ID_FIELDS.some(function (field) {
      return cleanCompare(record[field]) === exactId;
    });
  }

  function processUpdateRow(row, rootSnapshot) {
    if (row.status !== "Ready") {
      return Promise.resolve({
        itemID: row.itemID,
        item_name: row.item_name,
        QTY: row.QTY,
        old_price: "",
        new_price: row.new_price == null ? "" : row.new_price,
        status: "Skipped: " + row.status
      });
    }

    var recordSnapshot = findRecord(rootSnapshot, row.itemID);

    if (!recordSnapshot || !recordSnapshot.exists()) {
      var newRecord = {
        item_id: row.itemID,
        item_name: row.item_name,
        old_price: "N/A",
        new_price: row.new_price
      };

      if (row.QTY) {
        newRecord.QTY = row.QTY;
      }

      return getCreateRef(rootSnapshot, row.itemID).set(newRecord).then(function () {
        return {
          itemID: row.itemID,
          item_name: row.item_name,
          QTY: row.QTY,
          old_price: "N/A",
          new_price: row.new_price,
          status: "Created"
        };
      });
    }

    return recordSnapshot.ref.once("value").then(function (latestSnapshot) {
      var existing = latestSnapshot.val() || {};
      var currentNewPrice = existing.new_price == null ? "" : existing.new_price;

      return latestSnapshot.ref.update({
        old_price: currentNewPrice,
        new_price: row.new_price
      }).then(function () {
        return {
          itemID: row.itemID,
          item_name: row.item_name || existing.item_name || existing.itemName || "",
          QTY: existing.QTY || existing.qty || "",
          old_price: currentNewPrice,
          new_price: row.new_price,
          status: "Updated"
        };
      });
    });
  }

  function processRowsInBatches(rows, batchSize, processRow, afterRow) {
    var chain = Promise.resolve();

    for (var start = 0; start < rows.length; start += batchSize) {
      (function (batch) {
        chain = chain.then(function () {
          return Promise.all(batch.map(function (row) {
            return processRow(row)
              .catch(function (error) {
                return {
                  itemID: row.itemID,
                  item_name: row.item_name,
                  QTY: row.QTY,
                  old_price: "",
                  new_price: row.new_price == null ? "" : row.new_price,
                  status: "Failed: " + error.message
                };
              })
              .then(function (logRow) {
                afterRow(logRow);
              });
          }));
        });
      })(rows.slice(start, start + batchSize));
    }

    return chain;
  }

  function updateDatabase() {
    var rowsToProcess = cleanedRows.slice();

    if (!rowsToProcess.length) {
      previewMatchedRows();
      return;
    }

    var db;

    try {
      db = getDatabase();
    } catch (error) {
      setSummary(error.message, "danger");
      return;
    }

    $("#updateDb").prop("disabled", true).text("Updating...");
    setProgress(0);

    db.ref().once("value").then(function (rootSnapshot) {
      var logs = [];
      var counts = {
        processed: 0,
        updated: 0,
        created: 0,
        skipped: 0,
        failed: 0
      };

      updateSubmitProgress(counts, rowsToProcess.length);

      return processRowsInBatches(
        rowsToProcess,
        UPDATE_BATCH_SIZE,
        function (row) {
          return processUpdateRow(row, rootSnapshot);
        },
        function (logRow) {
          logs.push(logRow);
          counts.processed += 1;

          if (logRow.status === "Updated") {
            counts.updated += 1;
          } else if (logRow.status === "Created") {
            counts.created += 1;
          } else if (logRow.status.indexOf("Failed") === 0) {
            counts.failed += 1;
          } else {
            counts.skipped += 1;
          }

          updateSubmitProgress(counts, rowsToProcess.length);
        }
      ).then(function () {
        var updatedCount = logs.filter(function (log) {
          return log.status === "Updated";
        }).length;
        var createdCount = logs.filter(function (log) {
          return log.status === "Created";
        }).length;
        var skippedCount = logs.filter(function (log) {
          return log.status.indexOf("Skipped") === 0;
        }).length;
        var failedCount = logs.filter(function (log) {
          return log.status.indexOf("Failed") === 0;
        }).length;

        renderLog(logs);
        setSummary(
          "Update complete: " + updatedCount + " updated, " +
            createdCount + " created, " +
            skippedCount + " skipped, " +
            failedCount + " failed out of " +
            rowsToProcess.length + " Excel rows.",
          failedCount ? "warning" : "success"
        );
      });
    }).catch(function (error) {
      setSummary("Update failed: " + error.message, "danger");
    }).finally(function () {
      $("#updateDb").prop("disabled", false).text("Update Database");
    });
  }

  $(function () {
    initLogTable();

    $("#upload").on("change", function (event) {
      var file = event.target.files[0];
      $(".custom-file-label").text(file ? file.name : "Choose Excel file");

      if (!file) {
        return;
      }

      setProgress(10);
      readExcelFile(file);
    });

    $("#previewRows").on("click", previewMatchedRows);
    $(".mapping-select").on("change", function () {
      $("#updateDb").hide();
      $("#output").text("");
    });
    $("#updateDb").on("click", updateDatabase);
  });
})();
