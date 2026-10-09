---
title: "Everyday performance 1 - Java Style Enums"
date: 2026-10-05
draft: false
slug: "everyday-perf-1"
---

TODO: Think about headers

The first post of this blog will dive into refactoring a real-life code snippet for readability and simplicity
while simultaneously improving performance by up to 50x. This kicks off the *everyday performance series*, where
I'll try to refute the claim that (reasonably) performant code surely comes with a tradeoff in maintainability or readability.

<!--more-->

> The everyday performance series is an ongoing series of examples showing that
> performant code does not necessarily equal arcane, borderline magic code. In fact, I'd wager that if you 
> create good, readable code, it should be reasonably fast as well. I would even go so far as to say that
> slow code often is correlated and sometimes even caused by poor design and readability.
> In this series, **all examples run or had been running in production!**

I recently stumbled over the following Java style enum code. Yes, the patented Java style enumeration pattern. The patent
is [expired](https://patents.google.com/patent/US7263687B2/en), so don't worry and in fact, as the example only used
`Name` and `Value` you could argue that it's not actually a Java style enum.

But to stay on topic, let's look at the code and see what we can simplify:
```csharp {linenos=table}
public class MyEnum : Enumeration
{
    public static MyEnum First { get; } = new MyEnum(nameof(First), 1);
    public static MyEnum Second { get; } = new MyEnum(nameof(Second), 2);
    public static MyEnum Third { get; } = new MyEnum(nameof(Third), 3);
    private MyEnum(string name, int value) : base(name, value)
    {
    }
}

public class Enumeration
{
    public string Name { get; private set; }
    public int Value { get; private set; }

    protected Enumeration(string name, int value)
    {
        Name = name;
        Value = value;
    }

    public static bool operator ==(Enumeration left, Enumeration right)
    {
        return Equals(left, right);
    }

    public static bool operator !=(Enumeration left, Enumeration right)
    {
        return !Equals(left, right);
    }

    public override bool Equals(object obj)
    {
        if(obj is not Enumeration otherValue)
            return false;

        bool typeMatches = 
            GetType() == obj.GetType()
            || GetType() == obj.GetType().BaseType
            || GetType().BaseType == obj.GetType();
        bool valueMatches = Value.Equals(otherValue.Value);
        return typeMatches && valueMatches;
    }

    public override int GetHashCode()
    {
        return Value.GetHashCode();
    }

    public static IEnumerable<T> GetAll<T>()
        where T : Enumeration
    {
        var type = typeof(T);
        var fields = type.GetProperties(
            System.Reflection.BindingFlags.Public 
            | System.Reflection.BindingFlags.Static 
            | System.Reflection.BindingFlags.DeclaredOnly);
        foreach (var field in fields)
        {
            yield return (T)field.GetValue(null);
        }
    }

    public static T FromValue<T>(int value)
        where T : Enumeration
    {
        var match = Parse<T, int>(value, "value", item => item.Value == value);
        return match;
    }

    public static T FromName<T>(string name)
        where T : Enumeration
    {
        var match = Parse<T, string>(name, "name", item => item.Name == name);
        return match;
    }
    
    public override string ToString()
    {
        return Name;
    }

    private static T Parse<T, K>(K value, string description, Func<T, bool> predicate)
        where T : Enumeration
    {
        var matchingItem = GetAll<T>().FirstOrDefault(predicate);
        if (matchingItem == null)
        {
            throw new InvalidOperationException($"'{value}' is not a valid {description} in {typeof(T)}");
        }
        return matchingItem;
    }
}
```

So first thing to notice is that the private constructor ensures that no one outside
can create an instance, meaning that if we don't mess up locally within the class, only 
one instance per value is ever created.
In other terms, a simple reference equality check is enough and we can get rid of the 
type matching in `Equals(object obj)`. In fact, we can remove everything
related to equality as this is the default object behavior anyway:

```diff {linenos=table,linenostart=16}
    protected Enumeration(string name, int value)
    {
        Name = name;
        Value = value;
    }

-   public static bool operator ==(Enumeration left, Enumeration right)
-   {
-       return Equals(left, right);
-   }
-
-   public static bool operator !=(Enumeration left, Enumeration right)
-   {
-       return !Equals(left, right);
-   }
-
-   public override bool Equals(object obj)
-   {
-       if(obj is not Enumeration otherValue)
-           return false;
-
-       bool typeMatches = 
-           GetType() == obj.GetType()
-           || GetType() == obj.GetType().BaseType
-           || GetType().BaseType == obj.GetType();
-       bool valueMatches = Value.Equals(otherValue.Value);
-       return typeMatches && valueMatches;
-   }
-
-   public override int GetHashCode()
-   {
-       return Value.GetHashCode();
-   }

    public static IEnumerable<T> GetAll<T>()
        where T : Enumeration
    {
```

This is not only much less code but also a lot faster:

```csharp {linenos=table}
public class EqualityBenchmark
{
    public MyEnum first = MyEnum.First;
    public MyEnum second = MyEnum.Second;

    [Benchmark]
    public bool Equality() => first.Equals(second);
}
```

| Method   | Mean      | Error     | StdDev    | Ratio | Allocated | Alloc Ratio |
|--------- |----------:|----------:|----------:|------:|----------:|------------:|
| Baseline | 0.9647 ns | 0.0078 ns | 0.0073 ns |  1.00 |         - |          NA |
| V1       | 0.1804 ns | 0.0049 ns | 0.0046 ns |  0.19 |         - |          NA |

**A 5x gain from deleting unnecessary code!**

Now, the current code doesn't allow us to write `MyEnum.FromName("First")`. We actually
have to write `MyEnum.FromName<MyEnum>("First")` respectively `Enumeration.FromName<MyEnum>("First")`.
Same for the `GetAll<T>`-method.
Let's fix that using the [Curiously recurring template pattern](https://en.wikipedia.org/wiki/Curiously_recurring_template_pattern).
We should also mark the class as `abstract`. The pattern also allows us to use a primary constructor as a sweet add-on as well:
```diff
-public class Enumeration
+public abstract class Enumeration<T>(string name, int value) where T : Enumeration<T>
```

which in turn allows us to change the enum like this:
```diff
-public class MyEnum : Enumeration
+public class MyEnum : Enumeration<MyEnum>
```

The `T` typeparameter is now available in the class, no need to specify it in each method:
```csharp {linenos=table,linenostart=29}
public static IEnumerable<T> GetAll()
{
    var type = typeof(T);
    var fields = type.GetProperties(
        System.Reflection.BindingFlags.Public 
        | System.Reflection.BindingFlags.Static 
        | System.Reflection.BindingFlags.DeclaredOnly);
    foreach (var field in fields)
    {
        yield return (T)field.GetValue(null);
    }
}

public static T FromValue(int value)
{
    var match = Parse(value, "value", item => item.Value == value);
    return match;
}

public static T FromName(string name)
{
    var match = Parse(name, "name", item => item.Name == name);
    return match;
}
```
The parse method also loses `T`, while `K` is now inferrable above.
```csharp {linenos=table,linenostart=56}
private static T Parse<K>(K value, string description, Func<T, bool> predicate)
{
    var matchingItem = GetAll().FirstOrDefault(predicate);
    if (matchingItem == null)
    {
        throw new InvalidOperationException($"'{value}' is not a valid {description} in {typeof(T)}");
    }
    return matchingItem;
}
```

This is not just simpler to use for us but also a bit faster:

`FromName`:
| Method   | Mean      | Error     | StdDev    | Ratio | Gen0   | Allocated | Alloc Ratio |
|--------- |----------:|----------:|----------:|------:|-------:|----------:|------------:|
| Baseline | 59.116 ns | 0.4192 ns | 0.3921 ns |  1.00 | 0.0110 |     184 B |        1.00 |
| V2       | 55.186 ns | 0.2967 ns | 0.2630 ns |  0.93 | 0.0110 |     184 B |        1.00 |

`FromValue`:
| Method   | Mean       | Error     | StdDev    | Ratio | Gen0   | Allocated | Alloc Ratio |
|--------- |-----------:|----------:|----------:|------:|-------:|----------:|------------:|
| Baseline | 62.3583 ns | 0.5907 ns | 0.5525 ns |  1.00 | 0.0110 |     184 B |        1.00 |
| V2       | 57.3083 ns | 0.4983 ns | 0.4661 ns |  0.92 | 0.0110 |     184 B |        1.00 |

As we restrict creation of values, let's make it more explicit that this is the case. With
the type parameter `T` now being readily available during initialization, we can change
`GetAll()` into an immutable property:

```csharp
public static IEnumerable<T> All { get; } 
    = typeof(T)
        .GetProperties(System.Reflection.BindingFlags.Public 
            | System.Reflection.BindingFlags.Static 
            | System.Reflection.BindingFlags.DeclaredOnly)
        .Select(prop => (T?)prop.GetValue(null)
             ?? throw new InvalidOperationException($"Property '{prop.Name}' in {typeof(T)} returned null"))
        .ToImmutableArray();
```

This actually caches reflection and gives us a huge boost:
`FromName`:
| Method   | Mean      | Error     | StdDev    | Ratio | Gen0   | Allocated | Alloc Ratio |
|--------- |----------:|----------:|----------:|------:|-------:|----------:|------------:|
| Baseline | 59.116 ns | 0.4192 ns | 0.3921 ns |  1.00 | 0.0110 |     184 B |        1.00 |
| V2       | 55.186 ns | 0.2967 ns | 0.2630 ns |  0.93 | 0.0110 |     184 B |        1.00 |
| V3       |  8.585 ns | 0.1275 ns | 0.1192 ns |  0.15 | 0.0033 |      56 B |        0.30 |

`FromValue`:
| Method   | Mean       | Error     | StdDev    | Ratio | Gen0   | Allocated | Alloc Ratio |
|--------- |-----------:|----------:|----------:|------:|-------:|----------:|------------:|
| Baseline | 62.3583 ns | 0.5907 ns | 0.5525 ns |  1.00 | 0.0110 |     184 B |        1.00 |
| V2       | 57.3083 ns | 0.4983 ns | 0.4661 ns |  0.92 | 0.0110 |     184 B |        1.00 |
| V3       |  8.7480 ns | 0.1081 ns | 0.1012 ns |  0.14 | 0.0033 |      56 B |        0.30 |

However, I still think the `Parse<K>` shared code is a bit too complex with passing in a lambda and
 `value` is only used for the exception. How could we get rid of that? Having the `All`-property, let's prepare
static fields to semantically encode that we want to access enumeration values by key or value:

```csharp
private static readonly Dictionary<string, T> _valuesByName = All.ToDictionary(x => x.Name);
private static readonly Dictionary<int, T> _valuesByValue = All.ToDictionary(x => x.Value);
```
As a practical add-on, this also validates that each name and value is actually unique (which is
desired in this case). It also allows us to get rid of `Parse<K>` and leaves us with simple `FromName` and `FromValue` methods:

```csharp
 public static T FromValue(int value)
 {
     if (!_valuesByValue.TryGetValue(value, out var result))
     {
         throw new ArgumentOutOfRangeException(nameof(value), $"Value '{value}' not found in {typeof(T)}.");
     }
     return result;
 }

 public static T FromName(string name)
 {
     if (!_valuesByName.TryGetValue(name, out var result))
     {
         throw new ArgumentOutOfRangeException(nameof(name), $"Name '{name}' not found in {typeof(T)}.");
     }
     return result;
 }
```

This gets rid of the enumeration and all allocation and hence, a bit of a boost:

`FromName`:
| Method   | Mean      | Error     | StdDev    | Ratio | Gen0   | Allocated | Alloc Ratio |
|--------- |----------:|----------:|----------:|------:|-------:|----------:|------------:|
| Baseline | 59.116 ns | 0.4192 ns | 0.3921 ns |  1.00 | 0.0110 |     184 B |        1.00 |
| V3       |  8.585 ns | 0.1275 ns | 0.1192 ns |  0.15 | 0.0033 |      56 B |        0.30 |
| V4       |  3.370 ns | 0.0166 ns | 0.0155 ns |  0.06 |      - |         - |        0.00 |

`FromValue`:
| Method   | Mean       | Error     | StdDev    | Ratio | Gen0   | Allocated | Alloc Ratio |
|--------- |-----------:|----------:|----------:|------:|-------:|----------:|------------:|
| Baseline | 62.3583 ns | 0.5907 ns | 0.5525 ns |  1.00 | 0.0110 |     184 B |        1.00 |
| V3       |  8.7480 ns | 0.1081 ns | 0.1012 ns |  0.14 | 0.0033 |      56 B |        0.30 |
| V4       |  2.1785 ns | 0.0372 ns | 0.0348 ns |  0.03 |      - |         - |        0.00 |

Last but not least, the dictionaries should be read-only. This is the only part where I'm using a bit
of performance knowledge: Static, only once created read-only collection should, as a rule of thumb, be *'Frozen'* instead
of `ImmutableDictionary` or just using the static type `IReadOnlyDictionary`. But it's simple enough, no need for obscure performance magic:

```csharp
private static readonly FrozenDictionary<string, T> _valuesByName = All.ToFrozenDictionary(x => x.Name);
private static readonly FrozenDictionary<int, T> _valuesByValue = All.ToFrozenDictionary(x => x.Value);
```

Using frozen dictionaries gives another boost again resulting in the final result for this post:

`FromName`:
| Method   | Mean      | Error     | StdDev    | Ratio | Gen0   | Allocated | Alloc Ratio |
|--------- |----------:|----------:|----------:|------:|-------:|----------:|------------:|
| Baseline | 59.116 ns | 0.4192 ns | 0.3921 ns |  1.00 | 0.0110 |     184 B |        1.00 |
| V4       |  3.370 ns | 0.0166 ns | 0.0155 ns |  0.06 |      - |         - |        0.00 |
| VFinal   |  2.024 ns | 0.0153 ns | 0.0143 ns |  0.03 |      - |         - |        0.00 |

`FromValue`:
| Method   | Mean       | Error     | StdDev    | Ratio | Gen0   | Allocated | Alloc Ratio |
|--------- |-----------:|----------:|----------:|------:|-------:|----------:|------------:|
| Baseline | 62.3583 ns | 0.5907 ns | 0.5525 ns |  1.00 | 0.0110 |     184 B |        1.00 |
| V4       |  2.1785 ns | 0.0372 ns | 0.0348 ns |  0.03 |      - |         - |        0.00 |
| VFinal   |  0.9837 ns | 0.0316 ns | 0.0296 ns |  0.02 |      - |         - |        0.00 |

## Conclusion

So we achieved a speed up of **~33x to ~50x for `FromName`/`FromValue` and around ~5x for equality**
comparisons while **we got rid of almost half of the code.**. Almost all refactorings have been
high-level and can be motivated by other reasons than performance alone! No arcane magic, just
simple and readable code with (close to) zero tradeoffs. Whether you write your code yourself or
let your agents code, performant code does not need to be complicated and no code needs
to be slow!

For completeness, here is the final version of the code:

```csharp{linenos=table}
public sealed class MyEnum : Enumeration<MyEnum>
{
    public static MyEnum First { get; } = new MyEnum(nameof(First), 1);
    public static MyEnum Second { get; } = new MyEnum(nameof(Second), 2);
    public static MyEnum Third { get; } = new MyEnum(nameof(Third), 3);
    private MyEnum(string name, int value) : base(name, value)
    {
    }
}

public abstract class Enumeration<T>(string name, int value) where T : Enumeration<T>
{
    public static IEnumerable<T> All { get; } = typeof(T)
        .GetProperties(
            System.Reflection.BindingFlags.Public 
            | System.Reflection.BindingFlags.Static
            | System.Reflection.BindingFlags.DeclaredOnly)
        .Select(prop => (T?)prop.GetValue(null) 
            ?? throw new InvalidOperationException($"Property '{prop.Name}' in {typeof(T)} returned null"))
        .ToImmutableArray();

    private static readonly FrozenDictionary<string, T> _valuesByName = All.ToFrozenDictionary(x => x.Name);
    private static readonly FrozenDictionary<int, T> _valuesByValue = All.ToFrozenDictionary(x => x.Value);

    public string Name { get; private set; } = name;

    public int Value { get; private set; } = value;

    public static T FromValue(int value)
    {
        if (!_valuesByValue.TryGetValue(value, out var result))
        {
            throw new ArgumentOutOfRangeException(nameof(value), $"Value '{value}' not found in {typeof(T)}.");
        }
        return result;
    }

    public static T FromName(string name)
    {
        if (!_valuesByName.TryGetValue(name, out var result))
        {
            throw new ArgumentOutOfRangeException(nameof(name), $"Name '{name}' not found in {typeof(T)}.");
        }
        return result;
    }

    public override string ToString()
    {
        return Name;
    }
}
```