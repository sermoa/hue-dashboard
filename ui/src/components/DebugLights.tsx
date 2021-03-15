import * as React from 'react';
import {useEffect, useState} from "react";

const url = "/proxy/lights";

export default () => {
    const [data, setData] = useState<any>();

    const readData = () => {
        fetch(url)
            .then(response => {
                const data = response.json().then(setData);
            });
    };

    useEffect(() => {
        const timer = setInterval(readData, 5000);
        return () => clearInterval(timer);
    }, []);

    return <div>
        <h1>Lights</h1>
        <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
};