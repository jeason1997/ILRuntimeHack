#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using System;
using System.Text;
using System.Collections.Generic;
[System.Reflection.Obfuscation(Exclude = true)]
public class ILRuntimeCLRBinding
{
    [MenuItem("ILRuntime/Generate CLR Binding Code")]
    static void GenerateCLRBinding()
    {
        List<Type> types = new List<Type>();
        types.Add(typeof(int));
        types.Add(typeof(float));
        types.Add(typeof(long));
        types.Add(typeof(object));
        types.Add(typeof(string));
        types.Add(typeof(Array));
        types.Add(typeof(Vector2));
        types.Add(typeof(Vector3));
        types.Add(typeof(Quaternion));
        types.Add(typeof(GameObject));
        types.Add(typeof(UnityEngine.Object));
        types.Add(typeof(Transform));
        types.Add(typeof(RectTransform));
        types.Add(typeof(Time));
        types.Add(typeof(Debug));
        types.Add(typeof(Touch));
        //所有DLL内的类型的真实C#类型都是ILTypeInstance
        types.Add(typeof(List<ILRuntime.Runtime.Intepreter.ILTypeInstance>));
        //types.Add(typeof(Dictionary<int, List<float>>));

        //
        types.Add(typeof(ILogout));
        //types.Add(typeof(ModuleMgr));
        types.Add(typeof(XLog));

        types.Add(typeof(WindowConst));
        //types.Add(typeof(WindowBase));
        types.Add(typeof(EGame.WindowView));
        types.Add(typeof(WindowMgr));

        types.Add(typeof(ABMgr));
        types.Add(typeof(HotfixMgr));
        types.Add(typeof(TextMgr));
        //types.Add(typeof(GameConst));
        //types.Add(typeof(XInterface));




        //最终导出
        ILRuntime.Runtime.CLRBinding.BindingCodeGenerator.GenerateBindingCode(types, "Assets/ILRuntime/Generated");

    }

    [MenuItem("ILRuntime/Generate CLR Binding Code by Analysis")]
    public static void GenerateCLRBindingByAnalysis()
    {
        //用新的分析热更dll调用引用来生成绑定代码
        ILRuntime.Runtime.Enviorment.AppDomain domain = new ILRuntime.Runtime.Enviorment.AppDomain();
        System.IO.FileStream fs = new System.IO.FileStream("Data/EHotfix.dll", System.IO.FileMode.Open, System.IO.FileAccess.Read);
        domain.LoadAssembly(fs);

        List<Type> types = new List<Type>();
        types.Add(typeof(Touch));

        //Crossbind Adapter is needed to generate the correct binding code
        InitILRuntime(domain);
        ILRuntime.Runtime.CLRBinding.BindingCodeGenerator.GenerateBindingCode(domain, "Assets/ILRuntime/Generated",types);
#if false //2022.6.2打包报错
        ILRuntimeFix.AddILRuntimeCode();
#endif
        fs.Dispose();

        AssetDatabase.Refresh();
    }

    static void InitILRuntime(ILRuntime.Runtime.Enviorment.AppDomain domain)
    {
        //这里需要注册所有热更DLL中用到的跨域继承Adapter，否则无法正确抓取引用
        HotfixGate.RegisterCrossBindingAdaptor(domain);
        HotfixGate.RegisterDelegateConvertor(domain);
    }
}
#endif
