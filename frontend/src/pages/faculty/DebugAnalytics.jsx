import React, { useState, useEffect } from 'react';
import { facultyAPI } from '../../utils/api';

const DebugGroups = () => {
    useEffect(() => {
        facultyAPI.getUnallocatedGroups()
            .then(res => console.log("Unallocated data:", res?.data))
            .catch(err => console.error("Error", err));
    }, []);
    return <h1>Debug Debug</h1>
}
export default DebugGroups;
