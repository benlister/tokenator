/// <reference types="@figma/plugin-typings" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
figma.showUI(__html__, { width: 300, height: 585 });
// API Availability
const hasVariablesAPI = Boolean(figma.variables);
const hasGetLocalVariables = Boolean(hasVariablesAPI && figma.variables.getLocalVariablesAsync);
const hasGetLocalVariableCollections = Boolean(hasVariablesAPI && figma.variables.getLocalVariableCollectionsAsync);
const hasTeamLibraryAPI = Boolean(figma.teamLibrary && figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync && figma.teamLibrary.getVariablesInLibraryCollectionAsync);
const hasImportVariableByKey = Boolean(hasVariablesAPI && figma.variables.importVariableByKeyAsync);
console.log("API availability check:");
console.log("- Variables API:", hasVariablesAPI);
console.log("- getLocalVariablesAsync:", hasGetLocalVariables);
console.log("- getLocalVariableCollectionsAsync:", hasGetLocalVariableCollections);
console.log("- Team Library API (for library variables):", hasTeamLibraryAPI);
console.log("- Import Variable By Key Async:", hasImportVariableByKey);
figma.ui.postMessage({
    type: 'api-check',
    hasVariables: hasVariablesAPI,
    hasGetLocalVariables: hasGetLocalVariables,
    hasGetLocalCollections: hasGetLocalVariableCollections,
    hasTeamLibraryAPI: hasTeamLibraryAPI,
    hasImportVariableByKey: hasImportVariableByKey,
});
function getAllVariablesAndImportLibraries() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!hasVariablesAPI || !hasImportVariableByKey) {
            console.warn("Variables API or importVariableByKeyAsync not available. Cannot fetch all variables.");
            return [];
        }
        const allVariables = [];
        const processedVariableKeys = new Set();
        // 1. Get Local Variables
        if (hasGetLocalVariables) {
            try {
                console.log("Fetching local variables...");
                const localVariables = yield figma.variables.getLocalVariablesAsync();
                console.log(`Found ${localVariables.length} local variables.`);
                localVariables.forEach(v => {
                    if (!processedVariableKeys.has(v.key)) {
                        allVariables.push(v);
                        processedVariableKeys.add(v.key);
                    }
                });
            }
            catch (error) {
                console.error("Error getting local variables:", error);
            }
        }
        // 2. Get Variables from Enabled Libraries
        if (hasTeamLibraryAPI) {
            try {
                console.log("Fetching variables from enabled libraries...");
                const libraryCollections = yield figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
                console.log(`Found ${libraryCollections.length} available library variable collections.`);
                for (const libCollection of libraryCollections) {
                    const libraryVariablesInCollection = yield figma.teamLibrary.getVariablesInLibraryCollectionAsync(libCollection.key);
                    for (const libVarStub of libraryVariablesInCollection) {
                        if (!processedVariableKeys.has(libVarStub.key)) {
                            try {
                                const importedVariable = yield figma.variables.importVariableByKeyAsync(libVarStub.key);
                                allVariables.push(importedVariable);
                                processedVariableKeys.add(importedVariable.key);
                            }
                            catch (importError) {
                                console.error(`Error importing library variable '${libVarStub.name}' (key: ${libVarStub.key}):`, importError);
                            }
                        }
                    }
                }
            }
            catch (error) {
                console.error("Error getting library variables:", error);
            }
        }
        console.log(`Total unique variables processed (local + imported library): ${allVariables.length}`);
        return allVariables;
    });
}
function getSpacingVariables() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Getting all variables (local and imported library)...");
        const allResolvedVariables = yield getAllVariablesAndImportLibraries();
        console.log(`Processing ${allResolvedVariables.length} variables for spacing tokens.`);
        const spacingTokens = [];
        for (const variable of allResolvedVariables) {
            if (variable.resolvedType !== 'FLOAT') {
                continue;
            }
            const variableName = variable.name;
            const modeIds = Object.keys(variable.valuesByMode);
            if (modeIds.length === 0) {
                continue;
            }
            const firstModeId = modeIds[0];
            const variableValue = variable.valuesByMode[firstModeId];
            if (typeof variableValue === 'number' && variableValue >= 0) {
                const isSpacingName = /space|spacing|gap|padding|margin|size|grid/i.test(variableName);
                if (isSpacingName) {
                    spacingTokens.push({
                        id: variable.id, // The ID of the Variable object
                        key: variable.key,
                        name: variableName,
                        value: variableValue,
                        variableObject: variable, // Store the entire Variable object
                    });
                }
            }
        }
        console.log(`Total spacing tokens found: ${spacingTokens.length}`);
        spacingTokens.forEach(token => {
            console.log(`- Spacing Token: ${token.name}: ${token.value}px (ID: ${token.id}, Key: ${token.key})`);
        });
        return spacingTokens;
    });
}
function isAutoLayoutNode(node) {
    return node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE";
}
function findSpacingIssues() {
    return __awaiter(this, void 0, void 0, function* () {
        const spacingTokens = yield getSpacingVariables();
        const issues = [];
        function isIndividualPaddingBound(node, propertyName) {
            var _a;
            try {
                return ((_a = node.boundVariables) === null || _a === void 0 ? void 0 : _a[propertyName]) !== undefined;
            }
            catch (e) {
                console.warn(`Could not check boundVariables for ${node.name}.${propertyName}:`, e);
                return false;
            }
        }
        function isHorizontalPaddingBound(node) {
            return isIndividualPaddingBound(node, 'paddingLeft') && isIndividualPaddingBound(node, 'paddingRight');
        }
        function isVerticalPaddingBound(node) {
            return isIndividualPaddingBound(node, 'paddingTop') && isIndividualPaddingBound(node, 'paddingBottom');
        }
        function findMatchingTokenByValue(value) {
            if (spacingTokens.length === 0)
                return null;
            // Find the token that has the exact value
            return spacingTokens.find(token => token.value === value) || null;
        }
        function checkNode(node) {
            if (isAutoLayoutNode(node)) {
                if (node.layoutMode !== "NONE") {
                    if (node.itemSpacing !== undefined && node.itemSpacing > 0 && !isIndividualPaddingBound(node, 'itemSpacing')) {
                        const token = findMatchingTokenByValue(node.itemSpacing);
                        issues.push({
                            node: node,
                            property: "itemSpacing",
                            currentValue: node.itemSpacing,
                            matchingToken: token, // Store the full token
                            message: token ? `Map to ${token.name} (${token.value}px)` : `No exact token for ${node.itemSpacing}px gap.`,
                        });
                        // Add marker with appropriate color based on whether token exists
                        addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                    }
                    const { paddingTop, paddingBottom, paddingLeft, paddingRight } = node;
                    const allPaddingsSameAndPositive = paddingTop > 0 && paddingTop === paddingBottom && paddingTop === paddingLeft && paddingTop === paddingRight;
                    if (allPaddingsSameAndPositive &&
                        !isIndividualPaddingBound(node, 'paddingTop') &&
                        !isIndividualPaddingBound(node, 'paddingBottom') &&
                        !isIndividualPaddingBound(node, 'paddingLeft') &&
                        !isIndividualPaddingBound(node, 'paddingRight')) {
                        const token = findMatchingTokenByValue(paddingTop);
                        issues.push({ node, property: "paddingAll", currentValue: paddingTop, matchingToken: token, message: token ? `Map all padding to ${token.name}` : `No token for ${paddingTop}px uniform padding.` });
                        addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                    }
                    else {
                        if (paddingLeft > 0 && paddingLeft === paddingRight && !allPaddingsSameAndPositive && !isHorizontalPaddingBound(node)) {
                            const token = findMatchingTokenByValue(paddingLeft);
                            issues.push({ node, property: "horizontalPadding", currentValue: paddingLeft, matchingToken: token, message: token ? `Map horiz. padding to ${token.name}` : `No token for ${paddingLeft}px horiz. padding.` });
                            addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                        }
                        else {
                            if (paddingLeft > 0 && !isIndividualPaddingBound(node, 'paddingLeft') && !allPaddingsSameAndPositive && !(paddingLeft === paddingRight && !isHorizontalPaddingBound(node))) {
                                const token = findMatchingTokenByValue(paddingLeft);
                                issues.push({ node, property: "paddingLeft", currentValue: paddingLeft, matchingToken: token, message: token ? `Map left padding to ${token.name}` : `No token for ${paddingLeft}px left padding.` });
                                addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                            }
                            if (paddingRight > 0 && !isIndividualPaddingBound(node, 'paddingRight') && !allPaddingsSameAndPositive && !(paddingLeft === paddingRight && !isHorizontalPaddingBound(node))) {
                                const token = findMatchingTokenByValue(paddingRight);
                                issues.push({ node, property: "paddingRight", currentValue: paddingRight, matchingToken: token, message: token ? `Map right padding to ${token.name}` : `No token for ${paddingRight}px right padding.` });
                                addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                            }
                        }
                        if (paddingTop > 0 && paddingTop === paddingBottom && !allPaddingsSameAndPositive && !isVerticalPaddingBound(node)) {
                            const token = findMatchingTokenByValue(paddingTop);
                            issues.push({ node, property: "verticalPadding", currentValue: paddingTop, matchingToken: token, message: token ? `Map vert. padding to ${token.name}` : `No token for ${paddingTop}px vert. padding.` });
                            addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                        }
                        else {
                            if (paddingTop > 0 && !isIndividualPaddingBound(node, 'paddingTop') && !allPaddingsSameAndPositive && !(paddingTop === paddingBottom && !isVerticalPaddingBound(node))) {
                                const token = findMatchingTokenByValue(paddingTop);
                                issues.push({ node, property: "paddingTop", currentValue: paddingTop, matchingToken: token, message: token ? `Map top padding to ${token.name}` : `No token for ${paddingTop}px top padding.` });
                                addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                            }
                            if (paddingBottom > 0 && !isIndividualPaddingBound(node, 'paddingBottom') && !allPaddingsSameAndPositive && !(paddingTop === paddingBottom && !isVerticalPaddingBound(node))) {
                                const token = findMatchingTokenByValue(paddingBottom);
                                issues.push({ node, property: "paddingBottom", currentValue: paddingBottom, matchingToken: token, message: token ? `Map bottom padding to ${token.name}` : `No token for ${paddingBottom}px bottom padding.` });
                                addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                            }
                        }
                    }
                }
            }
            if ("children" in node) {
                for (const child of node.children) {
                    checkNode(child);
                }
            }
        }
        const nodesToCheck = figma.currentPage.selection.length > 0 ? figma.currentPage.selection : figma.currentPage.children;
        for (const node of nodesToCheck) {
            checkNode(node);
        }
        console.log(`Found ${issues.length} potential spacing issues.`);
        return issues;
    });
}
// Updated function to add color-coded markers based on whether the issue can be fixed
function addMarkerToNode(node, name, canFix) {
    try {
        // Remove any existing markers for this node first
        const existingMarkers = figma.currentPage.findAll(n => n.type === "ELLIPSE" &&
            n.getPluginData("markerFor") === node.id);
        existingMarkers.forEach(marker => marker.remove());
        // Create new marker
        const indicator = figma.createEllipse();
        // Set appropriate name and color based on whether the issue can be fixed
        if (canFix) {
            indicator.name = "✅ Can Fix Spacing";
            indicator.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.8, b: 0.2 } }]; // Green
        }
        else {
            indicator.name = "⚠️ No Token Match";
            indicator.fills = [{ type: 'SOLID', color: { r: 1, g: 0.2, b: 0.2 } }]; // Red
        }
        indicator.resize(8, 8);
        const absoluteX = node.absoluteTransform[0][2];
        const absoluteY = node.absoluteTransform[1][2];
        indicator.x = absoluteX - 12;
        indicator.y = absoluteY;
        indicator.setPluginData("markerFor", node.id);
        figma.currentPage.appendChild(indicator);
    }
    catch (e) {
        let message = 'Unknown error';
        if (e instanceof Error)
            message = e.message;
        else if (typeof e === 'string')
            message = e;
        console.error(`Error adding marker to node ${node.name}: ${message}`);
    }
}
// trySetBoundVariable now accepts the full SpacingToken object
function trySetBoundVariable(node, propertyName, token // Changed from variableId to the full token
) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            // Pass the actual Variable object from the token
            console.log(`Binding ${node.name}.${propertyName} to variable: ${token.name} (ID: ${token.id})`);
            node.setBoundVariable(propertyName, token.variableObject); // Use token.variableObject
            // Verify using node.boundVariables and the token's ID
            const boundVariableAlias = (_a = node.boundVariables) === null || _a === void 0 ? void 0 : _a[propertyName];
            if (boundVariableAlias && boundVariableAlias.id === token.id) { // Compare with token.id
                console.log(`Successfully bound ${propertyName} for ${node.name} to ${token.name}`);
                return true;
            }
            else {
                console.warn(`Verification failed for ${node.name}.${propertyName}. Bound alias:`, boundVariableAlias, `Expected ID: ${token.id}`);
                return false;
            }
        }
        catch (e) {
            let message = 'Unknown error during binding';
            if (e instanceof Error)
                message = e.message;
            else if (typeof e === 'string')
                message = e;
            console.error(`Error binding ${propertyName} for node ${node.name} to variable ${token.name} (ID: ${token.id}): ${message}`);
            // Check if the variable object itself might be an issue (though less likely if it came from getSpacingVariables)
            if (!token.variableObject || typeof token.variableObject.key !== 'string') {
                console.error("The provided token.variableObject seems invalid:", token.variableObject);
            }
            return false;
        }
    });
}
function fixSpacingIssues() {
    return __awaiter(this, void 0, void 0, function* () {
        clearMarkers();
        const issues = yield findSpacingIssues();
        let fixedCount = 0;
        let unfixableCount = 0;
        console.log(`Attempting to fix ${issues.length} spacing issues.`);
        // Count issues that don't have matching tokens
        issues.forEach(issue => {
            if (!issue.matchingToken) {
                unfixableCount++;
            }
        });
        for (const issue of issues) {
            // Ensure matchingToken and its variableObject are valid before proceeding
            if (issue.matchingToken && issue.matchingToken.variableObject) {
                const { node, property, matchingToken } = issue;
                let success = false;
                if (property === "paddingAll") {
                    const propsToBind = ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'];
                    let allSuccess = true;
                    for (const p of propsToBind) {
                        // Pass the full matchingToken
                        if (!(yield trySetBoundVariable(node, p, matchingToken)))
                            allSuccess = false;
                    }
                    success = allSuccess;
                }
                else if (property === "horizontalPadding") {
                    // Pass the full matchingToken
                    const S1 = yield trySetBoundVariable(node, 'paddingLeft', matchingToken);
                    const S2 = yield trySetBoundVariable(node, 'paddingRight', matchingToken);
                    success = S1 && S2;
                }
                else if (property === "verticalPadding") {
                    // Pass the full matchingToken
                    const S1 = yield trySetBoundVariable(node, 'paddingTop', matchingToken);
                    const S2 = yield trySetBoundVariable(node, 'paddingBottom', matchingToken);
                    success = S1 && S2;
                }
                else if (property === "itemSpacing" || property === "paddingLeft" || property === "paddingRight" || property === "paddingTop" || property === "paddingBottom") {
                    // Pass the full matchingToken
                    success = yield trySetBoundVariable(node, property, matchingToken);
                }
                if (success) {
                    fixedCount++;
                }
            }
        }
        console.log(`Successfully applied ${fixedCount} spacing variable bindings.`);
        console.log(`Unable to fix ${unfixableCount} issues due to missing matching tokens.`);
        if (fixedCount > 0) {
            figma.notify(`Applied ${fixedCount} spacing variable bindings. ${unfixableCount > 0 ? `${unfixableCount} values have no matching tokens (marked in red).` : ''}`);
        }
        else if (unfixableCount > 0) {
            figma.notify(`Found ${unfixableCount} spacing values without matching tokens (marked in red).`);
        }
        else if (issues.length === 0) {
            figma.notify(`No unlinked spacing values found.`);
        }
        // Instead of running findSpacingIssues again, let's return our counts
        return { fixed: fixedCount, unfixable: unfixableCount };
    });
}
// Update to the message handler in the main code
figma.ui.onmessage = (msg) => __awaiter(this, void 0, void 0, function* () {
    console.log("Received message from UI:", msg.type);
    try {
        if (msg.type === 'find-spacing-issues') {
            clearMarkers();
            const issues = yield findSpacingIssues();
            const uniqueNodeIds = new Set(issues.map(issue => issue.node.id));
            // Count issues that can be fixed vs. those that can't
            const fixableIssues = issues.filter(issue => issue.matchingToken !== null);
            const unfixableIssues = issues.filter(issue => issue.matchingToken === null);
            figma.ui.postMessage({
                type: 'spacing-issues-found',
                count: issues.length,
                fixableCount: fixableIssues.length,
                unfixableCount: unfixableIssues.length,
                nodeCount: uniqueNodeIds.size,
            });
            if (issues.length > 0) {
                const fixableMessage = fixableIssues.length > 0 ?
                    `${fixableIssues.length} can be auto-fixed (green markers)` : '';
                const unfixableMessage = unfixableIssues.length > 0 ?
                    `${unfixableIssues.length} have no matching tokens (red markers)` : '';
                figma.notify(`Found ${issues.length} spacing issues. ${fixableMessage}${fixableMessage && unfixableMessage ? '. ' : ''}${unfixableMessage}`);
            }
            else {
                figma.notify(`No unlinked spacing values found.`);
            }
        }
        else if (msg.type === 'fix-spacing-issues') {
            const result = yield fixSpacingIssues();
            figma.ui.postMessage({
                type: 'spacing-issues-fixed',
                fixedCount: result.fixed,
                unfixableCount: result.unfixable
            });
        }
        else if (msg.type === 'clear-markers') {
            const clearedCount = clearMarkers();
            figma.ui.postMessage({
                type: 'markers-cleared',
                count: clearedCount
            });
            if (clearedCount > 0)
                figma.notify(`Cleared ${clearedCount} markers.`);
        }
    }
    catch (error) {
        let message = 'Unknown error';
        if (error instanceof Error) {
            message = error.message;
        }
        else if (typeof error === 'string') {
            message = error;
        }
        console.error("Error handling UI message:", message, error);
        figma.notify(`Plugin error: ${message}. Check console.`, { error: true });
        figma.ui.postMessage({ type: 'error', message: message });
    }
});
function clearMarkers() {
    try {
        const markers = figma.currentPage.children.filter(node => node.type === "ELLIPSE" &&
            (node.name === "⚠️ No Token Match" ||
                node.name === "✅ Can Fix Spacing" ||
                node.name === "⚠️ Spacing Issue" ||
                node.name === "🎨 Color Issue") &&
            node.getPluginData("markerFor") !== "");
        let clearedCount = 0;
        markers.forEach(markerNode => {
            if (markerNode.type === "ELLIPSE") {
                markerNode.remove();
                clearedCount++;
            }
        });
        console.log(`Cleared ${clearedCount} markers.`);
        return clearedCount;
    }
    catch (error) {
        let message = 'Unknown error';
        if (error instanceof Error)
            message = error.message;
        else if (typeof error === 'string')
            message = error;
        console.error(`Error clearing markers: ${message}`);
        return 0;
    }
}
